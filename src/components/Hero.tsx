import doorUrl from '../assets/hero/door.jpg'

type Props = { count: number }

// Eight embers. Each gets its own column, delay and duration from --i so no two rise together;
// a single shared animation reads as a machine rather than as fire.
const EMBERS = Array.from({ length: 8 }, (_, i) => i)

// A full-viewport threshold. The board proper begins below it, so arriving at the site means
// arriving at a door rather than at a list — and the art gets seen at full size by everyone,
// including on touch and in a screenshot.
//
// The door is a still, given life in CSS. The life comes from the SCENE MOVING, not from
// brightness changing: a very slow scale drift on the image, a gentle breathe confined to the
// seam, and a few embers. An earlier version animated luminance across a full-viewport layer,
// which made the whole screen strobe — see app.css for the rule that replaced it.
export const Hero = ({ count }: Props) => (
  <header className="hero">
    <div className="hero__scene" style={{ backgroundImage: `url(${doorUrl})` }} aria-hidden="true" />
    <div className="hero__seam" aria-hidden="true" />
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
