import type { SampleRow, DatasetSplit } from '../data/dataset-types.js';

class SeededShuffle {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const temp = copy[i] as T;
      copy[i] = copy[j] as T;
      copy[j] = temp;
    }
    return copy;
  }
}

/**
 * Creates stratified Train (70%), Validation (15%), and Test (15%) splits
 * ensuring positive/negative class balance in all partitions.
 */
export function stratifiedSplit(
  data: readonly SampleRow[],
  seed = 42,
  trainRatio = 0.70,
  valRatio = 0.15
): DatasetSplit {
  const legit = data.filter((d) => d.label === 0);
  const scam = data.filter((d) => d.label === 1);

  const shuffler = new SeededShuffle(seed);
  const shuffledLegit = shuffler.shuffle(legit);
  const shuffledScam = shuffler.shuffle(scam);

  function splitGroup<T>(group: T[]): { train: T[]; val: T[]; test: T[] } {
    const n = group.length;
    const nTrain = Math.floor(n * trainRatio);
    const nVal = Math.floor(n * valRatio);

    return {
      train: group.slice(0, nTrain),
      val: group.slice(nTrain, nTrain + nVal),
      test: group.slice(nTrain + nVal)
    };
  }

  const legitSplits = splitGroup(shuffledLegit);
  const scamSplits = splitGroup(shuffledScam);

  return {
    train: shuffler.shuffle([...legitSplits.train, ...scamSplits.train]),
    validation: shuffler.shuffle([...legitSplits.val, ...scamSplits.val]),
    test: shuffler.shuffle([...legitSplits.test, ...scamSplits.test])
  };
}
