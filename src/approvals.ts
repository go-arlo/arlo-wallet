import { MultisigTransaction } from './transaction';
import { PublicKey } from '@solana/web3.js';

interface ApprovalRule {
  condition: (transaction: MultisigTransaction) => boolean;
  threshold: number;
  humansRequired: number;
  aiAgentsRequired: number;
}

interface SetLogicParams {
  defaultThreshold: number;
  thresholds: ApprovalRule[];
}

export class Approvals {
  defaultThreshold: number;
  thresholds: ApprovalRule[];

  constructor() {
    this.defaultThreshold = 0;
    this.thresholds = [];
  }

  setLogic(params: SetLogicParams): void {
    this.defaultThreshold = params.defaultThreshold;
    this.thresholds = params.thresholds;
  }

  checkApproval(
    transaction: MultisigTransaction,
    labels: { [key: string]: 'human' | 'ai' },
    defaultThreshold: number,
    owners: PublicKey[]
  ): { approved: boolean } {
    // Filter signatures to include only those from valid owners
    const validSignatures = transaction.signatures.filter((sig) =>
      owners.some((owner) => owner.toBase58() === sig)
    );

    // Classify signatures by their labels (human or AI)
    const humanSignatures = validSignatures.filter(
      (sig) => labels[sig] === 'human'
    );
    const aiSignatures = validSignatures.filter((sig) => labels[sig] === 'ai');

    let requiredThreshold = defaultThreshold;
    let requiredHumans = 0;
    let requiredAIs = 0;

    // Determine applicable approval rules based on transaction properties
    for (const rule of this.thresholds) {
      if (rule.condition(transaction)) {
        requiredThreshold = rule.threshold;
        requiredHumans = rule.humansRequired;
        requiredAIs = rule.aiAgentsRequired;
        break;
      }
    }

    const totalSignatures = validSignatures.length;

    const approved =
      totalSignatures >= requiredThreshold &&
      humanSignatures.length >= requiredHumans &&
      aiSignatures.length >= requiredAIs;

    return { approved };
  }
}
