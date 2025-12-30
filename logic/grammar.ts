
import { Grammar, Production, FirstFollowSets } from '../types';

const EPS = 'ε';

/**
 * Checks if a string represents an epsilon (empty) symbol.
 */
const isEpsilon = (s: string) => s === 'ε' || s.toLowerCase() === 'epsilon';

/**
 * Parses a grammar from a string input.
 * Now handles punctuation and adjacent symbols without requiring strict whitespace.
 */
export const parseGrammar = (input: string): Grammar => {
  const lines = input.split('\n').filter(l => l.trim() !== '');
  const productions: Production[] = [];
  const nonTerminals = new Set<string>();
  const terminals = new Set<string>();

  // 1. First Pass: Identify Non-Terminals from LHS
  lines.forEach(line => {
    const parts = line.split(/->|→|::=/).map(p => p.trim());
    if (parts.length >= 1 && parts[0]) {
      // Keep alphanumeric and common notation symbols for non-terminals
      const head = parts[0].split(/\s+/)[0].replace(/[^\w\d\s'<>]|_/g, '').trim();
      if (head) nonTerminals.add(head);
    }
  });

  // 2. Second Pass: Parse Production Bodies
  lines.forEach(line => {
    const parts = line.split(/->|→|::=/).map(p => p.trim());
    if (parts.length < 2) return;
    const head = parts[0].split(/\s+/)[0].replace(/[^\w\d\s'<>]|_/g, '').trim();
    
    const bodies = parts[1].split('|').map(b => b.trim());
    bodies.forEach(bodyStr => {
      // Improved tokenizer: Split by whitespace, but also separate punctuation tokens
      // This allows "switch id{CaseList}" to be parsed correctly
      let tokensWithPunctuation = bodyStr.split(/(\s+|[{}:;(),|])/)
        .map(t => t.trim())
        .filter(t => t !== '' && t !== '|');

      let finalBody: string[] = [];
      
      tokensWithPunctuation.forEach(token => {
        if (isEpsilon(token)) {
          finalBody.push(EPS);
        } else if (nonTerminals.has(token)) {
          finalBody.push(token);
        } else {
          // If it's not a known non-terminal, we treat it as a terminal
          // or a sequence of terminals (if spaces were missing)
          finalBody.push(token);
        }
      });

      const cleanBody = finalBody.length === 0 ? [EPS] : finalBody;
      productions.push({ head, body: cleanBody, id: productions.length });
      
      cleanBody.forEach(sym => {
        if (!nonTerminals.has(sym) && sym !== EPS) terminals.add(sym);
      });
    });
  });

  terminals.add('$');

  return { productions, terminals, nonTerminals, startSymbol: productions[0]?.head || '' };
};

export const augmentGrammar = (grammar: Grammar): Grammar => {
  const newStartSymbol = `${grammar.startSymbol}'`;
  const augmentedProduction: Production = {
    head: newStartSymbol,
    body: [grammar.startSymbol],
    id: 0,
  };

  const newProductions = [
    augmentedProduction,
    ...grammar.productions.map((p, i) => ({ ...p, id: i + 1 })),
  ];

  const newNonTerminals = new Set(grammar.nonTerminals);
  newNonTerminals.add(newStartSymbol);

  return {
    ...grammar,
    productions: newProductions,
    nonTerminals: newNonTerminals,
    startSymbol: newStartSymbol,
  };
};

export const computeFirstFollow = (grammar: Grammar): FirstFollowSets => {
  const first: Record<string, Set<string>> = {};
  const follow: Record<string, Set<string>> = {};

  grammar.nonTerminals.forEach(nt => { first[nt] = new Set(); follow[nt] = new Set(); });
  grammar.terminals.forEach(t => { first[t] = new Set([t]); });
  first[EPS] = new Set([EPS]);

  let changed = true;
  while (changed) {
    changed = false;
    grammar.productions.forEach(p => {
      const head = p.head;
      const beforeSize = first[head].size;
      let allNullable = true;
      for (const symbol of p.body) {
        const symbolFirst = first[symbol] || new Set([symbol]);
        symbolFirst.forEach(f => { if (f !== EPS) first[head].add(f); });
        if (!symbolFirst.has(EPS)) { allNullable = false; break; }
      }
      if (allNullable) first[head].add(EPS);
      if (first[head].size !== beforeSize) changed = true;
    });
  }

  follow[grammar.startSymbol].add('$');
  const userStart = Array.from(grammar.nonTerminals).find(nt => !nt.endsWith("'"));
  if (userStart) follow[userStart].add('$');

  changed = true;
  while (changed) {
    changed = false;
    grammar.productions.forEach(p => {
      const head = p.head;
      const body = p.body;
      for (let i = 0; i < body.length; i++) {
        const B = body[i];
        if (!grammar.nonTerminals.has(B)) continue;
        const beforeSize = follow[B].size;
        const beta = body.slice(i + 1);
        let betaIsNullable = true;
        if (beta.length > 0) {
          for (const sym of beta) {
            const symFirst = first[sym] || new Set([sym]);
            symFirst.forEach(f => { if (f !== EPS) follow[B].add(f); });
            if (!symFirst.has(EPS)) { betaIsNullable = false; break; }
          }
        }
        if (betaIsNullable) {
          follow[head].forEach(f => { if (f !== EPS) follow[B].add(f); });
        }
        if (follow[B].size !== beforeSize) changed = true;
      }
    });
  }
  return { first, follow };
};
