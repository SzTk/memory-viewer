import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import MemoryList from './components/MemoryList'
import MemoryDetail from './components/MemoryDetail'
import MemoryEditor from './components/MemoryEditor'

function Header() {
  const navigate = useNavigate()
  return (
    <header className="header">
      <Link to="/" className="header-logo">
        🧠 Memory Viewer
      </Link>
      <div className="header-spacer" />
      <button className="btn-new" onClick={() => navigate('/memory/new')}>
        + 新規作成
      </button>
    </header>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <Header />
        <main className="main">
          <Routes>
            <Route path="/" element={<MemoryList />} />
            <Route path="/memory/new" element={<MemoryEditor mode="create" />} />
            <Route path="/memory/:key" element={<MemoryDetail />} />
            <Route path="/memory/:key/edit" element={<MemoryEditor mode="edit" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
