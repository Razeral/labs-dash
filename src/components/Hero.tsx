import doorUrl from '../assets/hero/door.jpg'

type Props = { count: number }

// Twelve embers. Each gets its own drift column, delay and duration from --i so no two rise
// together; a single shared animation reads as a machine rather than as fire.
const EMBERS = Array.from({ length: 12 }, (_, i) => i)

// A full-viewport threshold. The board proper begins below it, so arriving at the site means
// arriving at a door rather than at a list — and the art gets seen at full size by everyone,
// including on touch and in a screenshot.
//
// The door is a still image, so the life is layered over it in CSS rather than baked in. The
// three layers are deliberately position-INDEPENDENT: the hero uses `background-size: cover`,
// so the door crops differently at every viewport and anything pinned to a feature's pixel
// coordinates would drift off it. What is stable is that the seam runs vertically down the
// horizontal centre — everything else is global light behaviour.
export const Hero = ({ count }: Props) => (
  <header className="hero" style={{ backgroundImage: `url(${doorUrl})` }}>
    <div className="hero__seam" aria-hidden="true" />
    <div className="hero__flicker" aria-hidden="true" />
    <div className="hero__embers" aria-hidden="true">
      {EMBERS.map((i) => (
        <span key={i} className="hero__ember" style={{ ['--i' as string]: i }} />
      ))}
    </div>

    <div className="hero__plate">
      <h1 className="hero__title">The Labs</h1>
      <p className="hero__sub">A bestiary of {count} works, ranked by vitality.</p>
    </div>
    <a className="hero__cue" href="#rank-living" aria-label="Enter — skip to the first rank">
      <span className="hero__cue-text">enter</span>
      <span className="hero__cue-glyph" aria-hidden="true">↓</span>
    </a>
  </header>
)
