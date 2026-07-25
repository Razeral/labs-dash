type Props = {
  changeCount: number
  onCopy: () => void
  onReset: () => void
}

export const EditBar = ({ changeCount, onCopy, onReset }: Props) => (
  <div className="editbar" role="toolbar" aria-label="Edit tiering">
    <span className="editbar__status">
      {changeCount === 0 ? 'no local changes' : `${changeCount} local change${changeCount === 1 ? '' : 's'}`}
    </span>
    <button className="editbar__action" onClick={onCopy}>copy projects.json</button>
    <button className="editbar__action" onClick={onReset} disabled={changeCount === 0}>reset overrides</button>
  </div>
)
