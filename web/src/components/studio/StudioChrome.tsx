export function StudioEpisodeModal() {
  return (
    <div className="modal-backdrop" id="episodeModal" aria-hidden="true">
      <div className="modal" role="dialog" aria-labelledby="episodeModalTitle">
        <h2 id="episodeModalTitle">New episode</h2>
        <div id="episodeModalBody" />
        <div className="modal-actions">
          <button type="button" className="btn" id="episodeModalCancel">
            Cancel
          </button>
          <button type="button" className="btn btn-primary" id="episodeModalSave">
            Save episode
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudioToast() {
  return <div className="toast" id="studioToast" role="status" aria-live="polite" />;
}
