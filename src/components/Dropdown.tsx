import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export default function Dropdown({
  trigger,
  children,
  align = 'right',
}: {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {trigger}
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className={`absolute top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} bg-white border border-brand-line rounded-lg shadow-lg py-1.5 min-w-[200px] z-20`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function DropdownItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 text-sm text-brand-carbon hover:bg-brand-cream flex items-center gap-2"
    >
      {children}
    </button>
  )
}

export function DropdownLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="block w-full text-left px-3 py-2 text-sm text-brand-carbon hover:bg-brand-cream flex items-center gap-2">
      {children}
    </Link>
  )
}
