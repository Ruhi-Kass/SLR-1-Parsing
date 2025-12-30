import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Settings, ChevronRight, ChevronLeft, HelpCircle, Table as TableIcon, Cpu, AlertCircle, Zap, ArrowRight,
  GitBranch, Layers, Network, Database, List, Send, Play, Info, Lock, Download
} from 'lucide-react';
import { parseGrammar, augmentGrammar, computeFirstFollow } from './logic/grammar';
import { buildDFA } from './logic/lr0';
import { buildTable } from './logic/slrTable';
import { simulateParsing } from './logic/simulator';
import {
  Grammar,
  State,
  ParseStep,
  ParseTreeNode,
  ParsingTable,
  Production
} from './types';

const GRAMMAR_PRESETS = [
  {
    name: "Nullable Sequence (S -> AB)",
    grammar: "S -> A B\nA -> a A | ε\nB -> b",
    input: "a b"
  },
  {
    name: "Switch Statement",
    grammar: "S -> switch id { CaseList }\nCaseList -> CaseList case id : S\nCaseList -> ε",
    input: "switch id { case id : switch id { } }"
  },
  {
    name: "Expression Grammar (SLR(1))",
    grammar: "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id",
    input: "id * ( id + id )"
  },
  {
    name: "Classic Conflict (NOT SLR(1))",
    grammar: "S -> A a | B b\nA -> c\nB -> c",
    input: "c a"
  }
];

const PROCESS_STEPS = [
  { id: 0, label: "1. Grammar Definition", icon: Settings },
  { id: 1, label: "2. Augmented Grammar", icon: GitBranch },
  { id: 2, label: "3. FIRST & FOLLOW Sets", icon: HelpCircle },
  { id: 3, label: "4. LR(0) Item Sets", icon: Layers },
  { id: 4, label: "5. DFA Diagram", icon: Network },
  { id: 5, label: "6. SLR(1) Parsing Table", icon: TableIcon },
  { id: 6, label: "7. Stack Implementation", icon: List },
  { id: 7, label: "8. Visual Parse Tree", icon: Play }
];

// ──────────────────────────────────────────────────────────────────────────────
// DFADiagram with labeled arrows (curved paths + symbol labels)
// ──────────────────────────────────────────────────────────────────────────────
const DFADiagram: React.FC<{ states: State[], grammar: Grammar }> = ({ states, grammar }) => {
  const [selectedState, setSelectedState] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { layout, width, height, transitions } = useMemo(() => {
    const levels: number[][] = [];
    const visited = new Set<number>();
    const stateToPos: Record<number, { x: number; y: number }> = {};

    const queue: { id: number; level: number }[] = [{ id: 0, level: 0 }];
    visited.add(0);

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (!levels[level]) levels[level] = [];
      levels[level].push(id);

      const state = states.find(s => s.id === id);
      if (state) {
        Object.values(state.transitions).forEach((targetId: number) => {
          if (!visited.has(targetId)) {
            visited.add(targetId);
            queue.push({ id: targetId, level: level + 1 });
          }
        });
      }
    }

    states.forEach(s => {
      if (!visited.has(s.id)) {
        const lastLevel = Math.max(0, levels.length - 1);
        if (!levels[lastLevel]) levels[lastLevel] = [];
        levels[lastLevel].push(s.id);
      }
    });

    const H_GAP = 350;
    const V_GAP = 220;
    const MARGIN_X = 150;
    const MARGIN_Y = 150;

    let maxIdx = 0;
    levels.forEach((lvlStates, lvlIdx) => {
      maxIdx = Math.max(maxIdx, lvlStates.length);
      const levelHeight = (lvlStates.length - 1) * V_GAP;
      lvlStates.forEach((id, idx) => {
        const yOffset = idx * V_GAP;
        stateToPos[id] = {
          x: MARGIN_X + lvlIdx * H_GAP,
          y: MARGIN_Y + yOffset
        };
      });
    });

    const graphWidth = MARGIN_X * 2 + (Math.max(levels.length - 1, 0)) * H_GAP + 200;
    const graphHeight = MARGIN_Y * 2 + (Math.max(maxIdx - 1, 0)) * V_GAP + 200;

    const transitionPaths: any[] = [];
    states.forEach(state => {
      Object.entries(state.transitions).forEach(([symbol, targetId]) => {
        const start = stateToPos[state.id];
        const end = stateToPos[targetId as number ];
        if (!start || !end) return;

        let path: string;
        let tx: number, ty: number;

        if (state.id === targetId) {
          // Self-loop
          path = `M ${start.x},${start.y - 40} C ${start.x - 60},${start.y - 120} ${start.x + 60},${start.y - 120} ${start.x},${start.y - 40}`;
          tx = start.x;
          ty = start.y - 90;
        } else {
          // Curved transition
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;
          const offset = 40;
          const cx = midX;
          const cy = midY - offset * (dx > 0 ? 1 : -1);
          path = `M ${start.x},${start.y} Q ${cx},${cy} ${end.x},${end.y}`;
          tx = cx;
          ty = cy;
        }

        transitionPaths.push({
          path,
          symbol,
          tx,
          ty,
          id: `${state.id}-${targetId}-${symbol}`
        });
      });
    });

    return {
      layout: stateToPos,
      width: graphWidth,
      height: graphHeight,
      transitions: transitionPaths
    };
  }, [states]);

  const handleDownload = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `slr1-dfa-diagram.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div className="w-full h-full flex flex-col gap-4 animate-in fade-in duration-500 overflow-hidden">
      <div className="flex justify-between items-center bg-white px-8 py-4 rounded-[2rem] border border-slate-100 shadow-sm shrink-0">
        <div className="flex flex-col">
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">DFA State Diagram</h3>
          <p className="text-[10px] text-slate-400 italic">Curved arrows show transitions with labeled symbols</p>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-[11px] hover:bg-green-600 transition-all shadow-md active:scale-95"
        >
          <Download className="w-3.5 h-3.5" /> Download SVG
        </button>
      </div>

      <div className="flex-1 bg-white rounded-[2.5rem] overflow-hidden border-2 border-slate-100 relative shadow-inner">
        <div className="w-full h-full overflow-auto custom-scrollbar bg-[radial-gradient(#f1f5f9_2px,transparent_2px)] [background-size:32px_32px]">
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            xmlns="http://www.w3.org/2000/svg"
            className="block"
          >
            <style>{`
              .node-container { font-family: 'JetBrains Mono', 'Inter', sans-serif; background: white; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 14px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
              .state-id { font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; }
              .item-line { font-size: 10px; margin-bottom: 4px; white-space: nowrap; font-weight: 500; }
              .head { color: #475569; font-weight: 800; }
              .arrow { color: #10b981; margin: 0 4px; }
              .dot { color: #10b981; font-weight: 900; }
              .symbol-box { fill: white; stroke: #cbd5e1; stroke-width: 1; filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.05)); }
              .transition-text { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 900; fill: #059669; }
              .edge-path { fill: none; stroke: #cbd5e1; stroke-width: 2.5; transition: stroke 0.2s; }
              .edge-path:hover { stroke: #64748b; }
            `}</style>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#cbd5e1" />
              </marker>
            </defs>

            {transitions.map((t: any) => (
              <g key={t.id}>
                <path d={t.path} className="edge-path" markerEnd="url(#arrowhead)" />
                <g transform={`translate(${t.tx - 20}, ${t.ty - 12})`}>
                  <rect width="40" height="24" rx="6" className="symbol-box" />
                  <text x="20" y="12" className="transition-text" textAnchor="middle" dominantBaseline="middle">
                    {t.symbol}
                  </text>
                </g>
              </g>
            ))}

            {states.map(state => (
              <foreignObject
                key={state.id}
                x={layout[state.id].x - 110}
                y={layout[state.id].y - 65}
                width="220"
                height="180"
              >
                <div
                  className={`node-container transition-all cursor-pointer bg-white ${
                    selectedState === state.id ? 'border-slate-900 ring-4 ring-slate-100 shadow-2xl scale-105' : 'hover:border-slate-400'
                  }`}
                  onClick={() => setSelectedState(state.id === selectedState ? null : state.id)}
                >
                  <div className="state-id">
                    <span>State I{state.id}</span>
                    {state.id === 0 && <span className="text-[8px] bg-slate-100 px-1.5 rounded text-slate-500">START</span>}
                  </div>
                  <div className="mono overflow-hidden">
                    {state.items.map((it, idx) => {
                      const p = grammar.productions.find(pr => pr.id === it.productionId)!;
                      const b = [...p.body];
                      b.splice(it.dotPosition, 0, "•");
                      return (
                        <div key={idx} className="item-line">
                          <span className="head">{p.head}</span> <span className="arrow">→</span>{' '}
                          {b.map((sym, si) => (
                            <span key={si} className={sym === '•' ? 'dot text-lg' : ''}>
                              {sym}{' '}
                            </span>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </foreignObject>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Parse Tree
// ──────────────────────────────────────────────────────────────────────────────
const TextbookTreeNode: React.FC<{ node: ParseTreeNode }> = ({ node }) => {
  const isLeaf = node.children.length === 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgLines, setSvgLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  useEffect(() => {
    const update = () => {
      if (!containerRef.current || isLeaf) return;
      const pLab = containerRef.current.querySelector(':scope > .node-label') as HTMLElement;
      const cWrap = containerRef.current.querySelector(':scope > .children-container') as HTMLElement;
      if (!pLab || !cWrap) return;

      const pR = pLab.getBoundingClientRect();
      const cR = cWrap.getBoundingClientRect();
      const pX = pR.left + pR.width / 2;
      const pY = pR.bottom;

      setSvgLines(Array.from(cWrap.children).map((c) => {
        const cl = (c as HTMLElement).querySelector('.node-label') as HTMLElement;
        if (!cl) return { x1: 0, y1: 0, x2: 0, y2: 0 };
        const cr = cl.getBoundingClientRect();
        return {
          x1: pX - cR.left,
          y1: pY - cR.top,
          x2: (cr.left + cr.width / 2) - cR.left,
          y2: cr.top - cR.top
        };
      }));
    };

    update();
    const timer = setTimeout(update, 100);
    window.addEventListener('resize', update);
    let parent: HTMLElement | null = containerRef.current?.parentElement || null;
    while (parent) {
      parent.addEventListener('scroll', update, { passive: true });
      parent = parent.parentElement;
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', update);
      parent = containerRef.current?.parentElement || null;
      while (parent) {
        parent.removeEventListener('scroll', update as any);
        parent = parent.parentElement;
      }
    };
  }, [node, isLeaf]);

  return (
    <div ref={containerRef} className="flex flex-col items-center">
      <div className="node-label flex flex-col items-center mb-1 z-10 px-2 bg-white rounded-md border border-slate-100 shadow-sm max-w-[14rem]">
        <span className="font-serif italic font-semibold text-sm text-slate-800 leading-tight py-1 text-center break-words">{node.label}</span>
        {isLeaf && node.value && node.value !== 'ε' && <span className="text-[10px] text-slate-400 mb-1">({node.value})</span>}
      </div>
      {node.children.length > 0 && (
        <div className="children-container flex gap-6 mt-6 relative flex-wrap justify-center">
          <svg className="absolute inset-0 pointer-events-none overflow-visible w-full h-full">
            {svgLines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="black" strokeWidth="1.5" />)}
          </svg>
          {node.children.map((c) => <TextbookTreeNode key={c.id} node={c} />)}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// StackBucket 
// ──────────────────────────────────────────────────────────────────────────────
const StackBucket: React.FC<{ stack: number[], symbols: string[] }> = ({ stack, symbols }) => (
  <div className="flex flex-col h-full bg-white border-2 border-slate-900 rounded-[1.5rem] overflow-hidden shadow-xl">
    <div className="bg-slate-900 text-white p-3 flex items-center gap-3">
      <Database className="w-4 h-4 text-green-400" />
      <h4 className="text-[10px] font-black uppercase tracking-widest">Stack Bucket</h4>
    </div>
    <div className="flex-1 overflow-auto flex flex-col p-3 gap-2 custom-scrollbar bg-slate-50">
      {Array.from({ length: stack.length }).map((_, i) => {
        const idx = stack.length - 1 - i;
        const state = stack[idx];
        const sym = symbols && symbols[idx] ? symbols[idx] : '';
        return (
          <div key={idx} className="flex gap-2 items-center animate-in slide-in-from-bottom-2">
            <div className="w-6 h-8 flex items-center justify-center font-black text-[10px] text-slate-300">{idx}</div>
            <div className="flex-1 flex gap-2 items-center">
              <div className={`min-w-[40%] bg-white border border-slate-200 rounded-lg flex items-center justify-center font-serif font-bold text-sm shadow-sm px-2 py-1 ${!sym ? 'opacity-0' : ''}`}>
                <div className="truncate max-w-full">{sym}</div>
              </div>
              <div className="w-12 bg-slate-900 text-green-400 rounded-lg flex items-center justify-center font-black text-xs shadow-md">{state}</div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────────
// Main App Component 
// ──────────────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [grammarInput, setGrammarInput] = useState('');
  const [inputString, setInputString] = useState('');
  const [initialStackText, setInitialStackText] = useState('');
  const [initialSymbolsText, setInitialSymbolsText] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [parsingSimStep, setParsingSimStep] = useState(0);
  const [simDebug, setSimDebug] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [showErrorPanel, setShowErrorPanel] = useState (true);

  const normalizeInput = (input: string): string => {
    return input
      .trim()
      .split(/\s+/)
      .filter(token => token.length > 0)
      .join(' ');
  };

  const analyzeGrammar = useCallback((gInput: string, iString: string) => {
    if (!gInput.trim()) return;

    setIsAnalyzing(true);
    setData(null);

    setTimeout(() => {
      try {
        const base = parseGrammar(gInput);
        if (base.productions.length === 0) {
          throw new Error("Invalid Grammar: Please provide at least one production rule using '->' notation.");
        }

        const augmented = augmentGrammar(base);
        const ff = computeFirstFollow(augmented);
        const states = buildDFA(augmented);
        const table = buildTable(augmented, states, ff);

        let hasConflicts = false;
        let conflictMessage = "";

        if (table.conflicts && table.conflicts.length > 0) {
          hasConflicts = true;
          conflictMessage = `Grammar is NOT suitable for SLR(1) parsing!\n\n` +
                           `${table.conflicts.length} conflict(s) detected:\n\n`;

          (table.conflicts as any[]).slice(0, 5).forEach((c: any) => {
            conflictMessage += `• State I${c.state}, symbol '${c.symbol}': ${c.type} conflict. (Existing: ${c.existing?.type || 'unknown'}, Proposed: ${c.new?.type || 'unknown'})\n`;
          });

          if (table.conflicts.length > 5) conflictMessage += `...and ${table.conflicts.length - 5} more.\n`;

         conflictMessage += `\nReason: Shift-reduce or reduce-reduce conflicts prevent deterministic parsing.\n` +
                            `You can view states, DFA, and table, but stack simulation and parse tree are disabled.`;
        }

        const simSteps = hasConflicts ? [] : simulateParsing(normalizeInput(iString), augmented, table);

        setData({
          base,
          augmented,
          ff,
          states,
          table,
          simSteps,
          hasConflicts,
          conflictMessage,
          error: null
        });

        setParsingSimStep(0);
      } catch (e: any) {
        setData({ error: e.message || "An unexpected error occurred during analysis." });
      } finally {
        setIsAnalyzing(false);
      }
    }, 200);
  }, []);

  const currentSimStep = data && !data.error ? data.simSteps[parsingSimStep] : null;

  const groupedProductions = useMemo(() => {
    if (!data?.augmented) return {};
    const groups: Record<string, Production[]> = {};
    data.augmented.productions.forEach((p: Production) => {
      if (!groups[p.head]) groups[p.head] = [];
      groups[p.head].push(p);
    });
    return groups;
  }, [data]);

  const handleBuild = () => {
    analyzeGrammar(grammarInput, inputString);
  };

  const canAccessStep = (stepId: number): boolean => {
    if (!data) return stepId === 0;
    if (data.error) return stepId <= 5;
    if (data.hasConflicts) return stepId <= 5;
    return true;
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#f8fafc] text-slate-900 overflow-hidden">
      <aside className="w-full lg:w-56 bg-white border-r border-slate-200 p-4 flex flex-col gap-1 shrink-0 shadow-lg z-30">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center shadow-md">
            <Cpu className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tighter">SLR(1)</h1>
            <p className="text-[8px] text-green-600 font-bold uppercase">Visual Parser</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1">
          {PROCESS_STEPS.map((step) => (
            <button
              key={step.id}
              onClick={() => canAccessStep(step.id) && setActiveStep(step.id)}
              disabled={!canAccessStep(step.id)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-[12px] font-bold transition-all border-2 
                ${activeStep === step.id ? 'bg-slate-950 text-white border-slate-950 shadow-lg translate-x-1' : 'text-slate-400 border-transparent hover:bg-slate-50 hover:text-slate-600'} 
                ${!canAccessStep(step.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <step.icon className="w-3.5 h-3.5" /> {step.label}
              {data?.hasConflicts && step.id >= 6 && <Lock className="w-4 h-4 ml-auto text-rose-500" />}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
          <h2 className="text-xl font-black tracking-tighter">{PROCESS_STEPS[activeStep].label}</h2>
          <div className="flex gap-3">
            <button
              onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
              className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm active:scale-95"
              disabled={activeStep === 0}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setActiveStep(prev => Math.min(PROCESS_STEPS.length - 1, prev + 1))}
              disabled={!data || data.error || !canAccessStep(activeStep + 1)}
              className="bg-slate-950 text-white px-4 py-2 rounded-lg font-black text-xs hover:bg-slate-800 transition-all flex items-center gap-2 shadow-md active:scale-95 disabled:opacity-30"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 lg:p-10 space-y-8 bg-slate-50/20 custom-scrollbar">
          {/* Error / Conflict messages - only after analysis */}
          {data?.error && (
            <div className="p-8 bg-rose-50 border-2 border-rose-100 rounded-[2rem] text-rose-800 font-bold flex gap-4 animate-in fade-in slide-in-from-top-4">
              <AlertCircle className="w-6 h-6" /> {data.error}
            </div>
          )}

          {data?.hasConflicts && (
            <div className="p-8 bg-rose-50 border-l-8 border-rose-600 rounded-[2rem] shadow-lg">
              <div className="flex items-start gap-6">
                <AlertCircle className="w-12 h-12 text-rose-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-2xl font-bold text-rose-800 mb-3">Grammar is NOT suitable for SLR(1) parsing</h3>
                  <pre className="text-rose-700 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                    {data.conflictMessage}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Step 0 - Grammar Input */}
          {activeStep === 0 && (
            <div className="grid grid-cols-12 gap-8 h-full">
              <div className="col-span-12 lg:col-span-8 relative">
                <div className="absolute right-6 top-4 z-20 flex items-center gap-2">
                  <button
                    onClick={handleBuild}
                    disabled={isAnalyzing || !grammarInput.trim()}
                    className="bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-sm shadow-md hover:bg-green-600 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Zap className="w-4 h-4 inline mr-2" /> {isAnalyzing ? 'Analyzing...' : 'Complie'}
                  </button>
                </div>
                <textarea
                  value={grammarInput}
                  onChange={(e) => setGrammarInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleBuild();
                    }
                  }}
                  rows={Math.min(30, Math.max(6, grammarInput.split('\n').filter(l => l.trim()).length * 2 || 6))}
                  className="w-full max-h-[60vh] h-auto p-4 mono text-lg bg-white border-2 border-slate-100 rounded-xl shadow-lg outline-none leading-relaxed focus:border-green-100 transition-colors whitespace-pre-wrap break-words overflow-auto resize-vertical"
                  placeholder="Enter grammar rule"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      setGrammarInput('');
                      setInputString('');
                      setInitialStackText('');
                      setInitialSymbolsText('');
                      setData(null);
                      setParsingSimStep(0);
                    }}
                    title="Start a new grammar"
                    className="bg-slate-200 text-slate-800 px-2 py-1 rounded-md font-bold text-xs shadow-sm hover:bg-slate-300 transition-all"
                  >
                    New
                  </button>

                  <button
                    onClick={() => { setData(null); setParsingSimStep(0); }}
                    title="Clear previous analysis results"
                    className="bg-slate-200 text-slate-800 px-2 py-1 rounded-md font-bold text-xs shadow-sm hover:bg-slate-300 transition-all"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="col-span-12 lg:col-span-4 bg-slate-900 rounded-xl p-6 text-white h-fit shadow-md">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Grammar Presets</h4>
                <div className="space-y-3">
                  {GRAMMAR_PRESETS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setGrammarInput(p.grammar);
                        setInputString(p.input);
                      }}
                      className="w-full p-3 rounded-lg text-left border border-slate-800 hover:bg-slate-800 transition-all text-xs font-bold flex items-center justify-between group"
                    >
                      <span>{p.name}</span>
                      <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all" />
                    </button>
                  ))}
                </div>
                <div className="mt-8 p-6 bg-slate-800/50 rounded-2xl border border-slate-700 text-[10px] text-slate-400 font-bold leading-relaxed">
                  <div className="flex items-center gap-2 mb-2 text-green-400">
                    <Info className="w-3 h-3" /> Syntax Guide
                  </div>
                  <p>• Use <span className="text-white">-&gt;</span> or <span className="text-white">→</span> for productions.</p>
                  <p>• Use <span className="text-white">|</span> to separate alternative bodies.</p>
                  <p>• Use <span className="text-white">ε</span> or <span className="text-white">epsilon</span> for the empty string.</p>
                </div>
              </div>
            </div>
          )}

          {/* Steps 1-5 */}
          {data && !data.error && (
            <>
              {activeStep === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in zoom-in-95">
                  {data.augmented.productions.map((p: any, i: number) => (
                    <div key={i} className="p-6 rounded-[1.5rem] bg-white border-2 border-slate-50 mono font-black text-base flex gap-4 items-start shadow-sm hover:shadow-md transition-all">
                      <div className="w-10 h-10 bg-slate-950 text-white rounded-lg flex items-center justify-center text-sm shrink-0">{p.id}</div>
                      <div className="flex-1 overflow-auto break-words whitespace-pre-wrap text-sm">
                        <div className="font-bold">{p.head} <span className="text-green-500">→</span></div>
                        <div className="text-slate-700 mt-1">{p.body.join(' ')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeStep === 2 && (
                <div className="space-y-8 animate-in fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {['first', 'follow'].map(type => (
                      <div key={type} className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
                        <h3 className="text-sm font-black uppercase text-green-600 mb-8 border-b pb-4">{type.toUpperCase()} Sets</h3>
                        {Object.entries(data.ff[type])
                          .filter(([sym]) => data.augmented.nonTerminals.has(sym) && !sym.endsWith("'"))
                          .map(([sym, set]: any) => (
                            <div key={sym} className="flex items-center gap-6 py-4 border-b border-slate-50 last:border-0">
                              <span className="w-16 mono font-black text-xl text-slate-900">{sym}</span>
                              <div className="flex gap-2 flex-wrap">
                                {Array.from(set).map((t: any) => (
                                  <span key={t} className="px-3 py-1 bg-green-50 text-green-700 rounded-lg mono text-[11px] font-bold border border-green-100">{t}</span>
                                ))}
                                {Array.from(set).length === 0 && <span className="text-slate-300 italic text-[10px]">Empty Set</span>}
                              </div>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                      <Info className="w-5 h-5 text-green-400" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rules Applied (SLR Standard)</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-[11px] leading-relaxed">
                      <div className="space-y-3 p-4 bg-slate-800/30 rounded-2xl border border-slate-700">
                        <div className="text-green-400 font-bold uppercase tracking-tighter">Rule 1: Start Initialization</div>
                        <p className="text-slate-400">The augmented start symbol <span className="mono text-white">S'</span> and the user's start symbol <span className="mono text-white">{data.base.startSymbol}</span> always include the end-marker <span className="mono text-white">$</span> in their Follow sets.</p>
                      </div>
                      <div className="space-y-3 p-4 bg-slate-800/30 rounded-2xl border border-slate-700">
                        <div className="text-green-400 font-bold uppercase tracking-tighter">Rule 2: Direct Successor</div>
                        <p className="text-slate-400">For a rule like <span className="mono text-white">A → α B β</span>, anything in <span className="mono text-white">First(β)</span> (except ε) is added to <span className="mono text-white">Follow(B)</span>.</p>
                      </div>
                      <div className="space-y-3 p-4 bg-slate-800/30 rounded-2xl border border-slate-700">
                        <div className="text-green-400 font-bold uppercase tracking-tighter">Rule 3: Propagation</div>
                        <p className="text-slate-400">If <span className="mono text-white">A → α B</span> or if <span className="mono text-white">β</span> is nullable, everything in <span className="mono text-white">Follow(A)</span> propagates down to <span className="mono text-white">Follow(B)</span>.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 3 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in">
                  {data.states.map((s: any) => (
                    <div key={s.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-slate-300 transition-all group">
                      <h4 className="text-[10px] font-black uppercase text-slate-300 group-hover:text-slate-900 mb-4 border-b pb-2 transition-colors">State I{s.id}</h4>
                      <div className="mono text-[10px] font-bold text-slate-500 space-y-1">
                        {s.items.map((it: any, i: number) => {
                          const p = data.augmented.productions.find((pr: any) => pr.id === it.productionId)!;
                          const b = [...p.body];
                          b.splice(it.dotPosition, 0, "•");
                          return <div key={i}>{p.head} <span className="text-green-500">→</span> {b.join(' ')}</div>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeStep === 4 && <DFADiagram states={data.states} grammar={data.augmented} />}

              {activeStep === 5 && (
                <div className="bg-white border border-slate-100 rounded-[3rem] shadow-xl overflow-hidden overflow-x-auto animate-in slide-in-from-bottom-4">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-white">
                        <th className="p-6 border-r border-white/10 text-xs font-black uppercase sticky left-0 z-10 bg-slate-950">State</th>
                        {data.table.terminals.map((t: any) => <th key={t} className="p-6 border-r border-white/10 mono text-green-300">{t}</th>)}
                        {data.table.nonTerminals.map((nt: any) => <th key={nt} className="p-6 border-r border-white/10 mono text-amber-300">{nt}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {data.states.map((s: any) => (
                        <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-4 bg-slate-50 font-black border-r border-slate-100 text-xl sticky left-0 z-10">{s.id}</td>
                          {data.table.terminals.map((t: any) => {
                            const a = data.table.action[s.id]?.[t];
                            return (
                              <td key={t} className="p-4 border-r border-slate-100 mono font-black text-sm">
                                {a?.type === 'shift' && <span className="text-blue-600 bg-blue-50 px-3 py-1 rounded-md border border-blue-100">S{a.value}</span>}
                                {a?.type === 'reduce' && <span className="text-orange-600 bg-orange-50 px-3 py-1 rounded-md border border-orange-100">R{a.value}</span>}
                                {a?.type === 'accept' && <span className="bg-green-600 text-white px-4 py-2 rounded-full text-[10px] uppercase shadow-sm">Accept</span>}
                              </td>
                            );
                          })}
                          {data.table.nonTerminals.map((nt: any) => (
                            <td key={nt} className="p-4 border-r border-slate-100 mono font-black text-amber-600 text-lg">
                              {data.table.goto[s.id]?.[nt] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.table.conflicts?.length > 0 && (
                    <div className="bg-rose-950 text-white p-6 mono text-[10px]">
                      <div className="flex items-center gap-2 mb-2 text-rose-400 font-black">
                        <AlertCircle className="w-4 h-4" /> CONFLICTS DETECTED
                      </div>
                      {data.table.conflicts.map((c: any, i: number) => (
                        <div key={i}>
                          State {c.state} on {c.symbol}: {c.type} (Existing: {c.existing?.type || 'unknown'}, New: {c.new?.type || 'unknown'})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Steps 6 & 7 - Protected */}
          {data && !data.error && activeStep >= 6 ? (
            data.hasConflicts ? (
              <div className="flex flex-col items-center justify-center h-[70vh] text-center px-8">
                <Lock className="w-32 h-32 text-rose-500 mb-10 opacity-90" />
                <h2 className="text-4xl font-bold text-rose-800 mb-6">Cannot Proceed</h2>
                <p className="text-xl text-slate-700 max-w-3xl leading-relaxed mb-8">
                  This grammar is **not suitable for SLR(1) parsing** because it contains<br />
                  **shift-reduce** or **reduce-reduce** conflicts.
                </p>
                <p className="text-lg text-slate-600">
                  The parsing table was successfully built (you can view it in step 6),<br />
                  but deterministic stack-based simulation and parse tree construction<br />
                  are impossible due to ambiguity.
                </p>
              </div>
            ) : (
              <>
                {activeStep === 6 && (
                  <div className="space-y-8 animate-in fade-in">
                    <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex flex-col md:flex-row items-center gap-6">
                      <div className="flex-1 space-y-2 w-full">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-8 italic">
                          Simulation Input Buffer (Customizable)
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={inputString}
                            onChange={(e) => setInputString(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && analyzeGrammar(grammarInput, inputString)}
                            placeholder="e.g. id + id"
                            className="w-full px-10 py-5 bg-slate-50 border-2 border-slate-50 rounded-[2rem] focus:bg-white focus:border-slate-900 shadow-inner mono font-black outline-none transition-all pr-20"
                          />
                          {isAnalyzing && (
                            <div className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 animate-pulse text-[10px] font-black">
                              Parsing...
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => analyzeGrammar(grammarInput, inputString)}
                        className="p-6 bg-slate-950 text-white rounded-[2rem] shadow-xl hover:bg-green-600 active:scale-95 transition-all w-full md:w-auto mt-4 md:mt-6"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-xl overflow-hidden overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-950 text-white border-b-2 border-slate-800 sticky top-0 z-10">
                            <th className="p-5 text-xs font-black border-r border-white/10 text-center">#</th>
                            <th className="p-5 text-sm font-black border-r border-white/10">STACK</th>
                            <th className="p-5 text-sm font-black border-r border-white/10">SYMBOLS</th>
                            <th className="p-5 text-sm font-black border-r border-white/10">INPUT BUFFER</th>
                            <th className="p-5 text-sm font-black">PARSER ACTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.simSteps.map((step: any, idx: number) => (
                            <tr
                              key={idx}
                              onClick={() => setParsingSimStep(idx)}
                              className={`border-b border-slate-100 transition-all cursor-pointer ${
                                idx === parsingSimStep ? 'bg-green-50 ring-2 ring-inset ring-green-400' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="p-4 text-center border-r border-slate-100 font-black text-slate-300">{idx + 1}</td>
                              <td className="p-4 border-r border-slate-100 mono text-[12px] font-bold text-slate-800">
                                {step.stack.join(', ')}
                              </td>
                              <td className="p-4 border-r border-slate-100 mono text-[12px] font-bold text-green-700">
                                {step.symbols.join(' ')}
                              </td>
                              <td className="p-4 border-r border-slate-100 mono text-[12px] font-bold text-slate-400">
                                {step.input.join(' ')}
                              </td>
                              <td className="p-4 font-bold text-xs">
                                <span
                                  className={`px-2 py-1 rounded-md ${
                                    step.action.includes('Shift')
                                      ? 'text-blue-600 bg-blue-50'
                                      : step.action.includes('Reduce')
                                      ? 'text-orange-600 bg-orange-50'
                                      : step.action.includes('GoTo')
                                      ? 'text-indigo-500 bg-indigo-50'
                                      : step.action === 'Accept'
                                      ? 'text-white bg-green-600'
                                      : 'text-rose-600 bg-rose-50'
                                  }`}
                                >
                                  {step.action}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeStep === 7 && currentSimStep && (
                  <div className="grid grid-cols-12 gap-8 h-[600px] animate-in fade-in zoom-in-95">
                    <div className="col-span-12 lg:col-span-2 h-full">
                      <StackBucket stack={currentSimStep.stack} symbols={currentSimStep.symbols} />
                    </div>
                    <div className="col-span-12 lg:col-span-10 bg-white p-8 lg:p-12 rounded-[3.5rem] border-2 border-slate-100 shadow-2xl overflow-auto relative custom-scrollbar flex flex-col items-center">
                      <div className="absolute top-8 left-10 flex flex-col gap-1">
                        <div className="flex items-center gap-2 opacity-40 italic">
                          <Network className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase">Parse Step {parsingSimStep + 1}</span>
                        </div>
                        <div className="text-[12px] font-bold text-slate-400 max-w-md">
                          {currentSimStep.explanation}
                        </div>
                      </div>

                      <div className="flex-1 w-full flex items-start justify-center pt-8 pb-8 gap-6 overflow-auto flex-wrap">
                        {currentSimStep.forest?.length > 0 ? (
                          currentSimStep.forest.map((root: any) => (
                            <div
                              key={root.id}
                              className="animate-in fade-in slide-in-from-bottom-4 flex-shrink-0 max-w-[28rem] inline-block m-2"
                            >
                              <TextbookTreeNode node={root} />
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center gap-4 text-slate-200 animate-pulse mt-20">
                            <Layers className="w-20 h-20" />
                            <div className="font-black text-2xl italic">Stack is Empty</div>
                          </div>
                        )}
                      </div>

                      <div className="w-full flex items-center justify-between border-t border-slate-100 pt-8 mt-4 bg-white sticky bottom-0 z-10">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setParsingSimStep(p => Math.max(0, p - 1))}
                            className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 active:scale-90 transition-all shadow-sm"
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </button>
                          <button
                            onClick={() => setParsingSimStep(p => Math.min(data.simSteps.length - 1, p + 1))}
                            className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-green-600 active:scale-90 transition-all shadow-md"
                          >
                            <ChevronRight className="w-6 h-6" />
                          </button>
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Current Action</div>
                          <div
                            className={`px-8 py-3 rounded-2xl font-black text-xs shadow-sm border ${
                              currentSimStep.action.includes('Shift')
                                ? 'bg-blue-600 text-white border-blue-400'
                                : currentSimStep.action.includes('Reduce')
                                ? 'bg-orange-500 text-white border-orange-300'
                                : currentSimStep.action === 'Accept'
                                ? 'bg-green-600 text-white border-green-400'
                                : 'bg-slate-900 text-white border-slate-700'
                            }`}
                          >
                            {currentSimStep.action}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )
          ) : null}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
      `}</style>
    </div>
  );
};

export default App;