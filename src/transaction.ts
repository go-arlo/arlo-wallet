import {
  Transaction,
  SystemProgram,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import crypto from 'crypto';

// Import the Memo program's public key
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

interface CreateTransactionParams {
  fromPubkey: PublicKey;
  toPubkey: PublicKey;
  amount: number;
  data: string | null;
}

export class MultisigTransaction {
  id: string;
  tx: Transaction;
  amount: number;
  signatures: string[];

  constructor(params: {
    id: string;
    tx: Transaction;
    amount: number;
    signatures?: string[];
  }) {
    this.id = params.id;
    this.tx = params.tx;
    this.amount = params.amount;
    this.signatures = params.signatures || [];
  }

  static create(params: CreateTransactionParams): MultisigTransaction {
    const { fromPubkey, toPubkey, amount, data } = params;
    const instructions: TransactionInstruction[] = [];

    // Transfer instruction
    instructions.push(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: amount * 1e9, // Convert SOL to lamports
      })
    );

    // If data is provided, add a Memo instruction
    if (data) {
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(data, 'utf8'),
      });
      instructions.push(memoInstruction);
    }

    const tx = new Transaction().add(...instructions);

    // Generate a unique ID for the transaction
    const id = crypto.randomBytes(16).toString('hex');

    return new MultisigTransaction({
      id,
      tx,
      amount,
      signatures: [],
    });
  }

  addSignature(signerPubkey: PublicKey): void {
    const signerAddress = signerPubkey.toBase58();
    if (!this.signatures.includes(signerAddress)) {
      this.signatures.push(signerAddress);
    }
  }

  hasSignature(signerPubkey: PublicKey): boolean {
    return this.signatures.includes(signerPubkey.toBase58());
  }
}
