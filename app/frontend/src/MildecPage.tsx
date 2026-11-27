import { api } from './api'
import { ResultsView } from './ResultsView'

// Module-level so the function identity is stable across renders.
const load = () => api.mildecResults()

const COLUMNS = ['text', 'tick', 'agentId', 'timestamp']

export default function MildecPage() {
  return (
    <>
      <div className="stack">
        <h1>MILDEC simulation results</h1>
        <p className="lede">
          v2 scores for 1,713 simulated social media posts about NATO forces and drones around Killeen and Temple,
          Texas. Each post gets a score from −1 to +1 for each factor, where higher means more of it: more fear, more
          stress, higher morale, more trust. Group by <code>tick</code> to see how the population's mood changes as the
          scenario unfolds.
        </p>
      </div>
      <ResultsView load={load} model="v2" columns={COLUMNS} heading="Score distributions" />
    </>
  )
}
