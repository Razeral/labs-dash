import { TIERS } from '../types'
import { tierArt } from '../data/tierArt'
import type { Tier } from '../types'

type Props = { active: Tier }

// Every rank's backdrop is mounted at once and crossfaded by opacity. Swapping a single
// element's background-image instead would flash: the new image decodes after the swap, so
// the layer paints empty for a frame. Mounting all five lets the browser decode them up
// front and makes the transition a pure compositor opacity change.
export const Backdrop = ({ active }: Props) => (
  <div className="backdrop" aria-hidden="true">
    {TIERS.filter((t) => tierArt[t]).map((t) => (
      <div
        key={t}
        className={`backdrop__layer${t === active ? ' is-active' : ''}`}
        style={{ backgroundImage: `url(${tierArt[t]})` }}
      />
    ))}
  </div>
)
