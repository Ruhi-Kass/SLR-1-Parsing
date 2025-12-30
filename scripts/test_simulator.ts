import { parseGrammar, augmentGrammar, computeFirstFollow } from '../logic/grammar.ts';
import { buildDFA, getClosure } from '../logic/lr0.ts';
import { buildTable } from '../logic/slrTable.ts';
import { simulateParsing } from '../logic/simulator.ts';

const GRAMMAR = `S -> E
E -> E + T | T
T -> T * F | F
F -> id`;

const INPUT = 'id + id * id';

const SWITCH_GRAMMAR = `S -> switch id { CaseList }
CaseList -> CaseList case id : S
CaseList -> ε`;

const SWITCH_INPUT = 'switch id { case id : switch id { } }';

function dumpDFA(states: any) {
  console.log('DFA States:', states.length);
  states.forEach((s: any) => {
    console.log(`State ${s.id}:`);
    s.items.forEach((it: any) => console.log(`  prod ${it.productionId} dot ${it.dotPosition}`));
    console.log('  transitions:', s.transitions);
  });
}

(async () => {
  try {
    const base = parseGrammar(GRAMMAR);
    const augmented = augmentGrammar(base);
    const ff = computeFirstFollow(augmented);
    console.log('FIRST and FOLLOW:');
    console.log('FIRST:', ff.first);
    console.log('FOLLOW:', ff.follow);

    const states = buildDFA(augmented);
    dumpDFA(states);

    const table = buildTable(augmented, states, ff as any);
    console.log('Parsing table action keys for state 0:', Object.keys(table.action[0] || {}));
    console.log('Conflicts:', table.conflicts);

    const steps = simulateParsing(INPUT, augmented, table as any);
    console.log('Simulation steps count:', steps.length);
    console.log('Last step:', steps[steps.length - 1]);
    console.log('\n---- SWITCH GRAMMAR TEST ----');
    const base2 = parseGrammar(SWITCH_GRAMMAR);
    const aug2 = augmentGrammar(base2);
    const ff2 = computeFirstFollow(aug2);
    const st2 = buildDFA(aug2);
    dumpDFA(st2);
    const table2 = buildTable(aug2, st2, ff2 as any);
    console.log('Table conflicts:', table2.conflicts);
    const steps2 = simulateParsing(SWITCH_INPUT, aug2, table2 as any);
    console.log('Switch sim steps:', steps2.length);
    console.log('Final step:', steps2[steps2.length-1]);
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
