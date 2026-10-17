// Horizontal-scrolling chip row (trip pickers, filters).
export default function Chips({ items, active, onSelect }) {
  return (
    <div className="chips">
      {items.map((c) => (
        <button key={c.id} className={'chip' + (c.id === active ? ' active' : '')} onClick={() => onSelect(c.id)}>{c.label}</button>
      ))}
    </div>
  );
}
