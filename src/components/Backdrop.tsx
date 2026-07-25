import { TIERS } from '../types'
import { tierArt } from '../data/tierArt'
import type { Tier } from '../types'

type Props = { active: Tier; focus?: string | null }

// Every rank's backdrop is mounted at once and crossfaded by opacity. Swapping a single
// element's background-image instead would flash: the new image decodes after the swap, so
// the layer paints empty for a frame. Mounting all five lets the browser decode them up
// front and makes the transition a pure compositor opacity change.
export const Backdrop = ({ active, focus }: Props) => (
  <div className={`backdrop${focus ? ' is-focused' : ''}`} aria-hidden="true">
    {TIERS.filter((t) => tierArt[t]).map((t) => (
      <div
        key={t}
        className={`backdrop__layer${t === active ? ' is-active' : ''}`}
        style={{ backgroundImage: `url(${tierArt[t]})` }}
      />
    ))}
    {/* The focus layer is always mounted and only its image and opacity change, so leaving a
        card fades out rather than cutting. Unmounting it would remove the element mid-fade. */}
    <div
      className={`backdrop__layer backdrop__layer--focus${focus ? ' is-active' : ''}`}
      style={focus ? { backgroundImage: `url(${focus})` } : undefined}
    />
  </div>
)
