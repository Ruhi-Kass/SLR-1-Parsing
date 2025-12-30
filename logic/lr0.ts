
import { Grammar, LRItem, ItemSet, State, Production } from '../types';

const areItemsEqual = (a: LRItem, b: LRItem) => 
  a.productionId === b.productionId && a.dotPosition === b.dotPosition;

const areItemSetsEqual = (a: ItemSet, b: ItemSet) => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.productionId - y.productionId || x.dotPosition - y.dotPosition);
  const sortedB = [...b].sort((x, y) => x.productionId - y.productionId || x.dotPosition - y.dotPosition);
  return sortedA.every((item, i) => areItemsEqual(item, sortedB[i]));
};

export const getClosure = (items: ItemSet, grammar: Grammar): ItemSet => {
  const closure = [...items];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < closure.length; i++) {
      const item = closure[i];
      const prod = grammar.productions.find(p => p.id === item.productionId)!;
        const symbolAfterDot = prod.body[item.dotPosition];

        // Guard against dotPosition at end (undefined) and non-string values
        if (typeof symbolAfterDot === 'string' && grammar.nonTerminals.has(symbolAfterDot)) {
        grammar.productions.forEach(p => {
          if (p.head === symbolAfterDot) {
            const newItem: LRItem = { productionId: p.id, dotPosition: 0 };
            if (!closure.some(it => areItemsEqual(it, newItem))) {
              closure.push(newItem);
              changed = true;
            }
          }
        });
      }
    }
  }
  return closure;
};

export const getGoto = (items: ItemSet, symbol: string, grammar: Grammar): ItemSet => {
  const nextItems: ItemSet = [];
  items.forEach(item => {
    const prod = grammar.productions.find(p => p.id === item.productionId)!;
    const sym = prod.body[item.dotPosition];
    if (typeof sym === 'string' && sym === symbol) {
      nextItems.push({ ...item, dotPosition: item.dotPosition + 1 });
    }
  });
  return getClosure(nextItems, grammar);
};

export const buildDFA = (grammar: Grammar): State[] => {
  const startItem: LRItem = { productionId: grammar.productions[0].id, dotPosition: 0 };
  const initialItems = getClosure([startItem], grammar);
  const states: State[] = [{ id: 0, items: initialItems, transitions: {} }];
  
  const allSymbols = [...Array.from(grammar.nonTerminals), ...Array.from(grammar.terminals)];

  let i = 0;
  while (i < states.length) {
    const currentState = states[i];
    allSymbols.forEach(symbol => {
      if (symbol === '$' || symbol === 'ε') return;
      const nextItems = getGoto(currentState.items, symbol, grammar);
      if (nextItems.length === 0) return;

      const existingStateIndex = states.findIndex(s => areItemSetsEqual(s.items, nextItems));
      if (existingStateIndex !== -1) {
        currentState.transitions[symbol] = existingStateIndex;
      } else {
        const newStateId = states.length;
        states.push({ id: newStateId, items: nextItems, transitions: {} });
        currentState.transitions[symbol] = newStateId;
      }
    });
    i++;
  }
  return states;
};
