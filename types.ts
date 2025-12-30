
export type Production = {
  head: string;
  body: string[];
  id: number;
};

export type Grammar = {
  productions: Production[];
  terminals: Set<string>;
  nonTerminals: Set<string>;
  startSymbol: string;
};

export type LRItem = {
  productionId: number;
  dotPosition: number;
};

export type ItemSet = LRItem[];

export type State = {
  id: number;
  items: ItemSet;
  transitions: Record<string, number>;
};

export type ActionType = 'shift' | 'reduce' | 'accept' | 'error';

export type ActionEntry = {
  type: ActionType;
  value?: number; // state id for shift, production id for reduce
};

export type Conflict = {
  state: number;
  symbol: string;
  type: 'Shift-Reduce' | 'Reduce-Reduce';
  existing: ActionEntry;
  new: ActionEntry;
};

export type ParsingTable = {
  action: Record<number, Record<string, ActionEntry>>;
  goto: Record<number, Record<string, number>>;
  terminals: string[];
  nonTerminals: string[];
  conflicts: Conflict[];
};

export type ParseTreeNode = {
  id: string;
  label: string;
  value?: string;
  children: ParseTreeNode[];
};

export type ParseStep = {
  step: number;
  stack: number[];
  symbols: string[];
  input: string[];
  action: string;
  explanation: string;
  tableCell?: { state: number, symbol: string };
  forest: ParseTreeNode[];
};

export type FirstFollowSets = {
  first: Record<string, Set<string>>;
  follow: Record<string, Set<string>>;
};
