
import { Grammar, State, ParsingTable, ActionEntry, FirstFollowSets, Conflict } from '../types';

export const buildTable = (grammar: Grammar, states: State[], ff: FirstFollowSets): ParsingTable => {
  const action: Record<number, Record<string, ActionEntry>> = {};
  const goto: Record<number, Record<string, number>> = {};
  const conflicts: Conflict[] = [];

  states.forEach(state => {
    action[state.id] = {};
    goto[state.id] = {};

    // Shift and Goto
    Object.entries(state.transitions).forEach(([symbol, nextStateId]) => {
      if (grammar.terminals.has(symbol)) {
        action[state.id][symbol] = { type: 'shift', value: nextStateId };
      } else if (grammar.nonTerminals.has(symbol)) {
        goto[state.id][symbol] = nextStateId;
      }
    });

    // Reduce and Accept
    state.items.forEach(item => {
      const prod = grammar.productions.find(p => p.id === item.productionId)!;
      // Check if the item is a reduction item (dot at the end)
      // or if it's an epsilon production (body is ['ε'])
      const isComplete = item.dotPosition === prod.body.length || (prod.body.length === 1 && prod.body[0] === 'ε');
      
      if (isComplete) {
        if (prod.head === grammar.startSymbol) {
          const existing = action[state.id]['$'];
          if (existing && existing.type !== 'accept') {
             conflicts.push({
               state: state.id,
               symbol: '$',
               type: existing.type === 'shift' ? 'Shift-Reduce' : 'Reduce-Reduce',
               existing,
               new: { type: 'accept' }
             });
          }
          action[state.id]['$'] = { type: 'accept' };
        } else {
          const follow = ff.follow[prod.head];
          if (follow) {
            follow.forEach(terminal => {
              const existing = action[state.id][terminal];
              const newAction: ActionEntry = { type: 'reduce', value: prod.id };

              if (existing) {
                // Determine conflict type
                const type = existing.type === 'shift' ? 'Shift-Reduce' : 'Reduce-Reduce';
                // Only add unique conflicts for this cell
                  // Avoid logging the exact same conflict multiple times for the same production
                const isDuplicate = conflicts.some(c => 
                  c.state === state.id && 
                  c.symbol === terminal && 
                  c.new.value === prod.id &&
                  c.type === type
                );

                if (!isDuplicate) {
                  conflicts.push({
                    state: state.id,
                    symbol: terminal,
                    type,
                    existing,
                    new: newAction
                  });
                }
                // In case of conflict, shift usually takes precedence in many parser generators, 
                // but for SLR(1) validation we just report it.
              } else {
                action[state.id][terminal] = newAction;
              }
            });
          }
        }
      }
    });
  });

  return {
    action,
    goto,
    terminals: Array.from(grammar.terminals),
    nonTerminals: Array.from(grammar.nonTerminals).filter(nt => nt !== grammar.startSymbol),
    conflicts
  };
};
