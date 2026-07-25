export type CopyState = 'idle' | 'copied' | 'failed'

type Props = {
  changeCount: number
  copyState: CopyState
  onCopy: () => void
  onReset: () => void
}

export const EditBar = ({ changeCount, copyState, onCopy, onReset }: Props) => (
  <div className="editbar" role="toolbar" aria-label="Edit tiering">
    <span className="editbar__status">
      {changeCount === 0 ? 'no local changes' : `${changeCount} local change${changeCount === 1 ? '' : 's'}`}
    </span>
    <button className="editbar__action" onClick={onCopy}>copy projects.json</button>
    {copyState !== 'idle' && (
      <span className="editbar__copy-status" role="status">
        {copyState === 'copied' ? 'copied' : 'copy failed'}
      </span>
    )}
    <button className="editbar__action" onClick={onReset} disabled={changeCount === 0}>reset overrides</button>
  </div>
)
