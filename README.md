SLR(1) Visual Parser

A beautiful, interactive web-based tool for visualizing the entire SLR(1) parsing process — from grammar definition to parse tree construction.

Perfect for students, educators, and anyone learning or teaching compiler design and parsing techniques.

Features
Step-by-step visualization of the SLR(1) parsing pipeline:

Grammar Definition
Augmented Grammar
FIRST & FOLLOW Sets
LR(0) Item Sets (States)
DFA Diagram (Data Flow Diagram of states with transitions)
SLR(1) Parsing Table
Stack-based Parsing Simulation
Visual Parse Tree
Interactive DFA Diagram with properly connected arrows and clean layout

Real-time stack visualization during parsing

Rich parse tree rendering with textbook-style node connections

Grammar presets for quick testing (including nullable, recursive, and expression grammars)

Clean, modern UI built with React and Tailwind CSS

Conflict detection with helpful error messages

How to Use
Enter your context-free grammar in the left editor using standard notation:

-> or → for production arrow
| for alternatives
ε or epsilon for empty string
(Optional) Enter an input string to parse in the simulation step.

Click Compile or select a preset to analyze the grammar.

Navigate through the 8 steps using the sidebar or "Next" button.

In the final step, step through the parsing simulation and watch the stack and parse tree update in real time.

Example Grammar
E -> E + T | T
T -> T * F | F
F -> ( E ) | id
Input: id * ( id + id )

Development
# Clone the repository
git clone https://github.com/yourusername/slr1-visual-parser.git
cd slr1-visual-parser

# Install dependencies
npm install

# Start development server
npm run dev
Built With
React + TypeScript
Tailwind CSS
Lucide React Icons
Vite
Contributing
Contributions are welcome! Feel free to open issues or submit pull requests.

License
Apache

Made with ❤️ for learning compiler theory

Happy parsing! 🚀


