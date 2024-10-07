import {
  Connection,
  Keypair,
  PublicKey,
  ParsedInstruction,
  PartiallyDecodedInstruction,
} from '@solana/web3.js';
import { MultisigWallet } from '../src/wallet';

jest.setTimeout(60000); // Increase timeout for async operations
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

function isParsedInstruction(
  instruction: ParsedInstruction | PartiallyDecodedInstruction
  ): instruction is ParsedInstruction {
  return 'parsed' in instruction;
}

describe('MultisigWallet', () => {
  let connection: Connection;
  let payer: Keypair;
  let owner1: Keypair;
  let owner2: Keypair;
  let aiAgent: Keypair;
  let wallet: MultisigWallet;

  beforeAll(async () => {
    // Initialize connection and keypairs
    connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    payer = Keypair.generate();
    owner1 = Keypair.generate();
    owner2 = Keypair.generate();
    aiAgent = Keypair.generate();

    // Airdrop SOL to payer and owners for testing
    const airdropPromises = [
      connection.requestAirdrop(payer.publicKey, 2e9), // 2 SOL
      connection.requestAirdrop(owner1.publicKey, 2e9),
      connection.requestAirdrop(owner2.publicKey, 2e9),
      connection.requestAirdrop(aiAgent.publicKey, 2e9),
    ];
    const airdropSignatures = await Promise.all(airdropPromises);
    await Promise.all(
      airdropSignatures.map((signature) =>
        connection.confirmTransaction(signature, 'confirmed')
      )
    );

    // Initialize the MultisigWallet
    wallet = new MultisigWallet(connection, payer);
  });

  test('should create a new multisig wallet', async () => {
    await wallet.createWallet({
      owners: [owner1.publicKey, owner2.publicKey, aiAgent.publicKey],
      threshold: 2,
      labels: {
        [owner1.publicKey.toBase58()]: 'human',
        [owner2.publicKey.toBase58()]: 'human',
        [aiAgent.publicKey.toBase58()]: 'ai',
      },
    });

    expect(wallet.walletAddress).toBeInstanceOf(PublicKey);
    console.log('Wallet address:', wallet.walletAddress!.toBase58());
  });

  test('should allocate AI budget', async () => {
    const amount = 1; // Allocate 1 SOL

    await wallet.allocateAIBudget({
      amount,
      aiAgents: [aiAgent.publicKey],
    });

    // Wait for the transaction to confirm
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check the balance of the multisig wallet
    const balance = await connection.getBalance(wallet.walletAddress!);
    expect(balance).toBeGreaterThanOrEqual(amount * 1e9); // Balance in lamports

    console.log(`Multisig wallet balance: ${balance / 1e9} SOL`);
  });

  test('should set approval logic', () => {
    wallet.setApprovals({
      defaultThreshold: 2,
      thresholds: [
        {
          condition: (transaction) => transaction.amount <= 0.5,
          threshold: 1,
          humansRequired: 1,
          aiAgentsRequired: 0,
        },
      ],
    });

    // Check that approvals are set correctly
    expect(wallet.approvals.defaultThreshold).toBe(2);
    expect(wallet.approvals.thresholds.length).toBe(1);
  });

  test('should propose a transaction', async () => {
    const recipient = Keypair.generate().publicKey;
    const amount = 0.1; // 0.1 SOL

    const transaction = await wallet.proposeTransaction({
      to: recipient,
      amount,
      data: null,
    });

    expect(transaction).toBeDefined();
    expect(wallet.pendingTransactions.length).toBe(1);
    expect(wallet.pendingTransactions[0].id).toBe(transaction.id);

    console.log('Proposed transaction ID:', transaction.id);
  });

  test('should sign and execute transaction when approvals are met', async () => {
    const transaction = wallet.pendingTransactions[0];

    // Sign with owner1
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: owner1,
    });

    // Since threshold is 1 for amount <= 0.5 SOL, transaction should be executed
    expect(wallet.pendingTransactions.length).toBe(0);
  });

  test('should require more signatures for higher amounts', async () => {
    // Propose a new transaction with amount > 0.5 SOL
    const recipient = Keypair.generate().publicKey;
    const amount = 0.8; // 0.8 SOL

    const transaction = await wallet.proposeTransaction({
      to: recipient,
      amount,
      data: null,
    });

    // Sign with owner1
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: owner1,
    });

    // Transaction should still be pending
    expect(wallet.pendingTransactions.length).toBe(1);

    // Sign with owner2
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: owner2,
    });

    // Now the threshold of 2 should be met, and transaction should be executed
    expect(wallet.pendingTransactions.length).toBe(0);
  });

  test('should handle AI agent signatures', async () => {
    // Propose a new transaction with amount <= AI budget
    const recipient = Keypair.generate().publicKey;
    const amount = 0.3; // 0.3 SOL

    const transaction = await wallet.proposeTransaction({
      to: recipient,
      amount,
      data: null,
    });

    // Sign with AI agent
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: aiAgent,
    });

    // Transaction should still be pending (since humansRequired is 1)
    expect(wallet.pendingTransactions.length).toBe(1);

    // Sign with owner1
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: owner1,
    });

    // Now transaction should be executed
    expect(wallet.pendingTransactions.length).toBe(0);
  });

  test('should not execute transaction if insufficient approvals', async () => {
    // Propose a new transaction with amount > AI budget and threshold
    const recipient = Keypair.generate().publicKey;
    const amount = 1.5; // 1.5 SOL

    const transaction = await wallet.proposeTransaction({
      to: recipient,
      amount,
      data: null,
    });

    // Sign with owner1
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: owner1,
    });

    // Transaction should still be pending
    expect(wallet.pendingTransactions.length).toBe(1);

    // Clean up by removing the transaction from pendingTransactions
    wallet.pendingTransactions = wallet.pendingTransactions.filter(
      (tx) => tx.id !== transaction.id
    );
  });

  test('should not count signatures from non-owners', async () => {
    // Propose a new transaction
    const recipient = Keypair.generate().publicKey;
    const amount = 0.1; // 0.1 SOL

    const transaction = await wallet.proposeTransaction({
      to: recipient,
      amount,
      data: null,
    });

    // Sign with an unauthorized signer (not in owners)
    const unauthorizedSigner = Keypair.generate(); // Not an owner

    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: unauthorizedSigner,
    });

    // Transaction should still be pending
    expect(wallet.pendingTransactions.length).toBe(1);

    // Signatures should not include the unauthorized signer
    expect(
      transaction.signatures.includes(unauthorizedSigner.publicKey.toBase58())
    ).toBe(true); // Signature is added
    expect(
      wallet.approvals.checkApproval(
        transaction,
        wallet.labels,
        wallet.threshold,
        wallet.owners
      ).approved
    ).toBe(false); // Approval should be false

    // Now sign with a valid owner
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: owner1,
    });

    // Depending on the approval logic, transaction may still require more signatures
    expect(wallet.pendingTransactions.length).toBe(1);

    // Now sign with another valid owner
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: owner2,
    });

    // Transaction should now be executed
    expect(wallet.pendingTransactions.length).toBe(0);
  });

  test('should handle transactions with data', async () => {
    const recipient = Keypair.generate().publicKey;
    const amount = 0.2; // 0.2 SOL
    const data = 'Test memo data';

    const transaction = await wallet.proposeTransaction({
      to: recipient,
      amount,
      data,
    });

    expect(transaction).toBeDefined();
    expect(wallet.pendingTransactions.length).toBe(1);
    expect(wallet.pendingTransactions[0].id).toBe(transaction.id);

    console.log('Proposed transaction with data ID:', transaction.id);

    // Sign with owner1
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: owner1,
    });

    // Transaction should still be pending (threshold is 2)
    expect(wallet.pendingTransactions.length).toBe(1);

    // Sign with owner2
    await wallet.signTransaction({
      transactionId: transaction.id,
      signer: owner2,
    });

    // Now the transaction should be executed
    expect(wallet.pendingTransactions.length).toBe(0);

    // Optionally, verify that the transaction included the memo instruction
    // Fetch the transaction details using the signature
    const signature = transaction.tx.signatures[0].signature?.toString('base64');

    if (signature) {
      const confirmedTransaction = await connection.getParsedTransaction(signature, 'confirmed');
      expect(confirmedTransaction).toBeDefined();
      if (confirmedTransaction) {
        const instructions = confirmedTransaction.transaction.message.instructions;
        const memoInstruction = instructions.find(
          (instr) => instr.programId.toBase58() === MEMO_PROGRAM_ID.toBase58()
        );
        expect(memoInstruction).toBeDefined();

        // Use the type guard here
        if (memoInstruction && isParsedInstruction(memoInstruction)) {
          expect(memoInstruction.parsed).toEqual({ memo: data });
        } else {
          throw new Error('Memo instruction is not a ParsedInstruction');
        }
      }
    }
  });
});
