import { Plus, TabTrips, TabMap, TabAlbums } from './Icons.jsx';

export default function TabBar({ tab, onTrips, onMap, onAlbums, onAdd }) {
  const cls = (t) => 'nav-btn' + (tab === t ? ' active' : '');
  return (
    <nav className="tabbar">
      <button className={cls('trips')} onClick={onTrips}><TabTrips /><span>Trips</span></button>
      <button className={cls('map')} onClick={onMap}><TabMap /><span>Map</span></button>
      <button className="fab press" onClick={onAdd} aria-label="Add memory"><Plus size={22} color="#FBF6EC" w={2.4} /></button>
      <button className={cls('albums')} onClick={onAlbums}><TabAlbums /><span>Albums</span></button>
    </nav>
  );
}
