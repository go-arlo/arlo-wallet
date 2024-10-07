import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    Keypair,
    Signer,
  } from '@solana/web3.js';
  import {
    TOKEN_PROGRAM_ID,
    createInitializeMultisigInstruction,
  } from '@solana/spl-token';
  import { Approvals } from './approvals';
  import { MultisigTransaction } from './transaction';
  import dotenv from 'dotenv';
  
  dotenv.config(); // For environment variables
  
  interface CreateWalletParams {
    owners: PublicKey[];
    threshold: number;
    labels: { [key: string]: 'human' | 'ai' };
  }
  
  interface AllocateAIBudgetParams {
    amount: number;
    aiAgents: PublicKey[];
  }
  
  interface SetApprovalsParams {
    defaultThreshold: number;
    thresholds: ApprovalRule[];
  }
  
  interface ApprovalRule {
    condition: (transaction: MultisigTransaction) => boolean;
    threshold: number;
    humansRequired: number;
    aiAgentsRequired: number;
  }
  
  interface ProposeTransactionParams {
    to: PublicKey;
    amount: number;
    data: string | null;
  }
  
  interface SignTransactionParams {
    transactionId: string;
    signer: Keypair;
  }
  
  export class MultisigWallet {
    connection: Connection;
    payer: Keypair;
    walletAddress: PublicKey | null;
    owners: PublicKey[];
    threshold: number;
    labels: { [key: string]: 'human' | 'ai' };
    aiBudget: number;
    aiAgents: PublicKey[];
    approvals: Approvals;
    pendingTransactions: MultisigTransaction[];
  
    constructor(connection: Connection, payer: Keypair) {
      this.connection = connection;
      this.payer = payer;
      this.walletAddress = process.env.WALLET_ADDRESS
        ? new PublicKey(process.env.WALLET_ADDRESS)
        : null;
      this.owners = [];
      this.threshold = 0;
      this.labels = {};
      this.aiBudget = 0;
      this.aiAgents = [];
      this.approvals = new Approvals();
      this.pendingTransactions = [];
    }
  
    async createWallet(params: CreateWalletParams): Promise<void> {
      const { owners, threshold, labels } = params;
      this.owners = owners;
      this.threshold = threshold;
      this.labels = labels;
  
      const multisigAccount = Keypair.generate();
  
      const multisigSpace = 355; // Space required for multisig account
      const lamports = await this.connection.getMinimumBalanceForRentExemption(
        multisigSpace
      );
  
      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: this.payer.publicKey,
          newAccountPubkey: multisigAccount.publicKey,
          lamports,
          space: multisigSpace,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMultisigInstruction(
          multisigAccount.publicKey,
          owners,
          threshold,
          TOKEN_PROGRAM_ID
        )
      );
  
      await this.connection.sendTransaction(transaction, [this.payer, multisigAccount], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
  
      this.walletAddress = multisigAccount.publicKey;
      console.log('Wallet created with address:', this.walletAddress.toBase58());
    }
  
    async allocateAIBudget(params: AllocateAIBudgetParams): Promise<void> {
      const { amount, aiAgents } = params;
      this.aiBudget = amount;
      this.aiAgents = aiAgents;
  
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.payer.publicKey,
          toPubkey: this.walletAddress!,
          lamports: amount * 1e9, // Convert SOL to lamports
        })
      );
  
      const signature = await this.connection.sendTransaction(transaction, [this.payer]);
      console.log(
        `Allocated ${amount} SOL budget to AI agents. Transaction signature: ${signature}`
      );
    }
  
    setApprovals(params: SetApprovalsParams): void {
      this.approvals.setLogic(params);
    }
  
    async proposeTransaction(params: ProposeTransactionParams): Promise<MultisigTransaction> {
      const { to, amount, data } = params;
      const multisigTx = MultisigTransaction.create({
        fromPubkey: this.walletAddress!,
        toPubkey: to,
        amount,
        data,
      });
  
      this.pendingTransactions.push(multisigTx);
      console.log('Transaction proposed with ID:', multisigTx.id);
      return multisigTx;
    }
  
    async signTransaction(params: SignTransactionParams): Promise<void> {
      try {
        const { transactionId, signer } = params;
        const transaction = this.pendingTransactions.find(
          (tx) => tx.id === transactionId
        );
        if (!transaction) {
          throw new Error('Transaction not found');
        }
  
        if (transaction.hasSignature(signer.publicKey)) {
          console.log('Signer has already signed this transaction.');
          return;
        }
  
        transaction.addSignature(signer.publicKey);
        console.log(
          `Transaction ${transaction.id} signed by ${signer.publicKey.toBase58()}`
        );
  
        const approvalResult = this.approvals.checkApproval(
          transaction,
          this.labels,
          this.threshold,
          this.owners
        );
  
        if (approvalResult.approved) {
          // Execute transaction
          try {
            const signature = await this.connection.sendTransaction(transaction.tx, [
              this.payer,
              signer,
            ]);
            console.log('Transaction executed with signature:', signature);
  
            // Remove from pending transactions
            this.pendingTransactions = this.pendingTransactions.filter(
              (tx) => tx.id !== transactionId
            );
          } catch (executionError) {
            console.error('Failed to execute transaction:', executionError);
          }
        } else {
          console.log(
            `Transaction ${transaction.id} requires more signatures to be approved.`
          );
        }
      } catch (error) {
        console.error('Error in signTransaction:', error);
      }
    }
  }
  