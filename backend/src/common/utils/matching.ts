import { truncateToPrecision } from './math';

export interface MatchInput {
  expectedValue: number;
  transferredValue: number;
  expectedFromAddress: string | null;
  transferredFromAddress: string;
}

export interface MatchResult {
  amountMatch: boolean;
  senderMatch: boolean;
  overallMatch: boolean;
}

export function evaluateMatch(input: MatchInput): MatchResult {
  const amountMatch = truncateToPrecision(input.expectedValue) === truncateToPrecision(input.transferredValue);

  let senderMatch = true;
  if (input.expectedFromAddress) {
    senderMatch = input.expectedFromAddress.toLowerCase() === input.transferredFromAddress.toLowerCase();
  }

  return {
    amountMatch,
    senderMatch,
    overallMatch: amountMatch && senderMatch,
  };
}
