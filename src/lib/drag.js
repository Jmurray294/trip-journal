// Drag and drop between the page and the sidebar (computer only): an itinerary item, or a whole trip,
// dropped on a trip or gathering in the sidebar moves there.
export const DRAG_TYPE = 'text/x-trip-journal';
export const startDrag = (e, payload) => {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
};
export const isOurDrag = (e) => [...(e.dataTransfer.types || [])].includes(DRAG_TYPE);
export const readDrag = (e) => { try { return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)); } catch (err) { return null; } };
