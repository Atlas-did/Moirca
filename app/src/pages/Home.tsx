import { useState } from 'react'
import '../App.css'

export default function Home() {
  const [count, setCount] = useState(0)

  return (
    <div className="p-5">
      <h1 className="text-lg font-semibold text-foreground">Vite + React</h1>
      <div className="panel-card p-4 mt-3">
        <button
          onClick={() => setCount((count) => count + 1)}
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-colors"
        >
          count is {count}
        </button>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Edit <code className="font-mono text-foreground">src/App.tsx</code> and save to test HMR
        </p>
      </div>
    </div>
  )
}
