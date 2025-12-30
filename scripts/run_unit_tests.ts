// use simple runtime checks to avoid importing node:assert under different loaders
import { parseGrammar, augmentGrammar, computeFirstFollow } from '../logic/grammar.ts';
import { buildDFA } from '../logic/lr0.ts';
import { buildTable } from '../logic/slrTable.ts';
import { simulateParsing } from '../logic/simulator.ts';

function run(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => console.log(`✔ ${name}`)).catch((e) => { console.error(`✖ ${name}`); throw e; });
    }
    console.log(`✔ ${name}`);
  } catch (e) {
    console.error(`✖ ${name}`);
    throw e;
  }
}

async function testCanonicalExpression() {
  const grammarText = `
E -> E + T
E -> T
T -> T * F
T -> F
F -> ( E )
F -> id
`;
  const inputTokens = ['id', '+', 'id', '*', 'id'];

  const grammar = parseGrammar(grammarText);
  const augmented = augmentGrammar(grammar);
  const { FIRST, FOLLOW } = computeFirstFollow(augmented);
  const dfa = buildDFA(augmented);
  const table = buildTable(augmented, dfa.states, FOLLOW);

  const sim = simulateParsing({ grammar: augmented, table, dfa, input: [...inputTokens] });

  // Expect simulation completed and final action is Accept
  if (!sim || !Array.isArray(sim.steps)) throw new Error('simulateParsing did not return steps');
  const last = sim.steps[sim.steps.length - 1];
  if (last.action !== 'Accept') throw new Error(`Expected Accept, got ${last.action}`);
}

async function testSwitchGrammar() {
  const grammarText = `
S -> switch id { CaseList }
CaseList -> case id : S CaseList
CaseList -> case id : S
`;
  // A crafted token sequence intended to match nested switch/case constructs.
  const inputTokens = ['switch', 'id', '{', 'case', 'id', ':', 'switch', 'id', '{', 'case', 'id', ':', 'S', '}', '}'];

  const grammar = parseGrammar(grammarText);
  const augmented = augmentGrammar(grammar);
  const { FIRST, FOLLOW } = computeFirstFollow(augmented);
  const dfa = buildDFA(augmented);
  const table = buildTable(augmented, dfa.states, FOLLOW);

  const sim = simulateParsing({ grammar: augmented, table, dfa, input: [...inputTokens] });
  if (!sim || !Array.isArray(sim.steps)) throw new Error('simulateParsing did not return steps');
  const last = sim.steps[sim.steps.length - 1];
  if (last.action !== 'Accept') throw new Error(`Expected Accept, got ${last.action}`);
}

async function main() {
  console.log('Running unit tests (quick pipeline checks)');
  await run('Canonical expression grammar -> Accept', testCanonicalExpression);
  await run('Switch grammar -> Accept', testSwitchGrammar);
  console.log('All tests passed');
}

main().catch((e) => {
  console.error('Tests failed:', e);
  process.exit(1);
});
