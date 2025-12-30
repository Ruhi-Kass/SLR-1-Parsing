import { Grammar, ParsingTable, ParseStep, ParseTreeNode } from '../types';

const EPS = 'ε';

export const simulateParsing = (
  inputStr: string,
  grammar: Grammar,
  table: ParsingTable,
  opts?: { initialStack?: number[]; initialSymbols?: string[]; debug?: boolean }
): ParseStep[] => {
  const sortedTerminals = Array.from(grammar.terminals)
    .filter(t => t !== '$' && t !== EPS)
    .sort((a, b) => b.length - a.length);

  const tokens: string[] = [];
  let remaining = inputStr.trim();

  while (remaining.length > 0) {
    if (remaining.startsWith(' ')) {
      remaining = remaining.substring(1);
      continue;
    }

    let matched = false;
    for (const t of sortedTerminals) {
      if (remaining.startsWith(t)) {
        tokens.push(t);
        remaining = remaining.substring(t.length).trim();
        matched = true;
        break;
      }
    }
    if (!matched) {
      const char = remaining[0];
      tokens.push(char);
      remaining = remaining.substring(1).trim();
    }
  }
  tokens.push('$');
  
  // initialize stack and symbol arrays; make them consistent lengths
  const stack: number[] = opts?.initialStack && opts.initialStack.length > 0 ? [...opts.initialStack] : [0];
  let symbols: string[] = opts?.initialSymbols && opts.initialSymbols.length > 0 ? [...opts.initialSymbols] : undefined as any;
  if (!symbols) {
    // if no symbols provided, seed with '$' for existing stack entries
    symbols = Array(stack.length).fill('$');
  }
  // If lengths mismatch, pad the shorter one
  if (symbols.length < stack.length) symbols = [...Array(stack.length - symbols.length).fill('$'), ...symbols];
  if (symbols.length > stack.length) {
    // pad stack with initial state 0
    while (stack.length < symbols.length) stack.unshift(0);
  }
  const nodeStack: ParseTreeNode[] = [];
  const steps: ParseStep[] = [];
  let inputIdx = 0;
  let stepCount = 0;
  let nodeIdCounter = 0;

  const createNode = (label: string, children: ParseTreeNode[] = [], value?: string): ParseTreeNode => ({
    id: `node-${nodeIdCounter++}`, label, children, value
  });

  // If initial symbols provided, create leaf nodes for them so the forest starts from the provided stack
  if (opts?.initialSymbols && opts.initialSymbols.length > 0) {
    for (const s of opts.initialSymbols) {
      // create a placeholder leaf for every provided initial symbol, including '$'
      // terminal value is omitted for '$' and for EPS
      const val = s === '$' || s === EPS ? undefined : s;
      nodeStack.push(createNode(s, [], val));
    }
  }

  // If no initialSymbols were provided but symbols was seeded from stack length,
  // create placeholder nodes so nodeStack aligns with symbols length.
  if ((!opts?.initialSymbols || opts.initialSymbols.length === 0) && symbols && symbols.length > 0 && nodeStack.length !== symbols.length) {
    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i];
      const val = s === '$' || s === EPS ? undefined : s;
      nodeStack.push(createNode(s, [], val));
    }
  }

  if (opts?.debug) {
    console.debug('simulateParsing DEBUG START');
    console.debug('tokens:', tokens);
    console.debug('initial stack:', stack);
    console.debug('initial symbols:', symbols);
  }

  const MAX_STEPS = 500;
  try {
    while (stepCount < MAX_STEPS) {
    const currentState = stack[stack.length - 1];
    const lookahead = tokens[inputIdx];
    const action = table.action[currentState]?.[lookahead];

    if (!action) {
      steps.push({
        step: stepCount,
        stack: [...stack],
        symbols: [...symbols],
        input: tokens.slice(inputIdx),
        action: 'Error',
        explanation: `Syntax Error: No action for state ${currentState} with token '${lookahead}'.`,
        forest: [...nodeStack]
      });
      if (opts?.debug) console.debug('No action -> Error', { step: stepCount, state: currentState, lookahead, stack: [...stack], symbols: [...symbols] });
      break;
    }

    if (action.type === 'shift') {
      const nextState = action.value!;
      if (opts?.debug) console.debug('Shift', { step: stepCount, state: currentState, lookahead, nextState });
      steps.push({
        step: stepCount++,
        stack: [...stack],
        symbols: [...symbols],
        input: tokens.slice(inputIdx),
        action: `Shift S${nextState}`,
        explanation: `Token '${lookahead}' found. Shifting to state ${nextState}.`,
        forest: [...nodeStack]
      });
      
      const leaf = createNode(lookahead, [], lookahead === '$' ? undefined : lookahead);
      nodeStack.push(leaf);
      stack.push(nextState);
      symbols.push(lookahead);
      inputIdx++;
      if (opts?.debug) console.debug('After shift stacks', { stack: [...stack], symbols: [...symbols], nodeStackLen: nodeStack.length });
    } 
    else if (action.type === 'reduce') {
      const prodId = action.value!;
      const prod = grammar.productions.find(p => p.id === prodId)!;
      const isEpsilonReduction = prod.body.length === 1 && prod.body[0] === EPS;
      const popCount = isEpsilonReduction ? 0 : prod.body.length;

      if (opts?.debug) console.debug('Reduce', { step: stepCount, prodId, prodHead: prod.head, prodBody: prod.body });
      steps.push({
        step: stepCount++,
        stack: [...stack],
        symbols: [...symbols],
        input: tokens.slice(inputIdx),
        action: `Reduce R${prod.id}: ${prod.head} → ${prod.body.join(' ')}`,
        explanation: `Rule matches. Reducing ${prod.body.join(' ')} to ${prod.head}.`,
        forest: [...nodeStack]
      });

      const children: ParseTreeNode[] = [];
      for (let i = 0; i < popCount; i++) {
        const node = nodeStack.pop();
        if (node) children.unshift(node);
        stack.pop();
        symbols.pop();
      }
      if (opts?.debug) console.debug('After pop for reduce', { stack: [...stack], symbols: [...symbols], childrenCount: children.length });
      
      if (isEpsilonReduction) {
        children.push(createNode(EPS));
      }

      const newNode = createNode(prod.head, children);
      const stateBeforeGoto = stack[stack.length - 1];
      const nextState = table.goto[stateBeforeGoto]?.[prod.head];

      if (nextState === undefined) {
        steps.push({
          step: stepCount,
          stack: [...stack],
          symbols: [...symbols],
          input: tokens.slice(inputIdx),
          action: 'Error',
          explanation: `Goto Error: No transition for state ${stateBeforeGoto} on symbol '${prod.head}'.`,
          forest: [...nodeStack]
        });
        if (opts?.debug) console.debug('Goto Error', { stateBeforeGoto, prodHead: prod.head, stack: [...stack], symbols: [...symbols] });
        break;
      }
      
      symbols.push(prod.head);
      nodeStack.push(newNode);
      stack.push(nextState);
      if (opts?.debug) console.debug('After reduce/goto', { stack: [...stack], symbols: [...symbols], nodeStackLen: nodeStack.length, nextState });

      steps.push({
        step: stepCount++,
        stack: [...stack],
        symbols: [...symbols],
        input: tokens.slice(inputIdx),
        action: `GoTo(${prod.head}, ${stateBeforeGoto}) = ${nextState}`,
        explanation: `Transitioning to state ${nextState} after reducing to ${prod.head}.`,
        forest: [...nodeStack]
      });
    } 
    else if (action.type === 'accept') {
      if (opts?.debug) console.debug('Accept', { step: stepCount, stack: [...stack], symbols: [...symbols] });
      steps.push({
        step: stepCount,
        stack: [...stack],
        symbols: [...symbols],
        input: tokens.slice(inputIdx),
        action: 'Accept',
        explanation: 'The input string has been successfully parsed!',
        forest: [...nodeStack]
      });
      break;
    }
  }
  } catch (err: any) {
    // Catch unexpected runtime errors and return a single error step instead of throwing
    const msg = err?.message || String(err);
    console.error('simulateParsing runtime error:', err);
    steps.push({
      step: stepCount,
      stack: [...stack],
      symbols: [...symbols],
      input: tokens.slice(inputIdx),
      action: 'Error',
      explanation: `Runtime Error: ${msg}`,
      forest: [...nodeStack]
    });
  }

  return steps;
};