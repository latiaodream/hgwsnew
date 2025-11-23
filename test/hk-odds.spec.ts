import { expect } from 'chai';
import { chgIorHK } from '../src/utils/crownOdds';

// Simple regression checks for HK odds conversion on known problematic values.

describe('chgIorHK (HK odds conversion)', () => {
  it('converts sample pairs to expected HK UI odds (approx)', () => {
    const [h1, c1] = chgIorHK(0.72, 1.17);
    expect(h1).to.equal(0.72);
    expect(c1).to.equal(1.2);

    const [h2, c2] = chgIorHK(0.71, 1.18);
    expect(h2).to.equal(0.71);
    expect(c2).to.equal(1.21);
  });
});

