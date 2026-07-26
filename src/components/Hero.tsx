import doorUrl from '../assets/hero/door.jpg'

type Props = { count: number }

// Eight embers. Each gets its own column, delay and duration from --i so no two rise together;
// a single shared animation reads as a machine rather than as fire.
const EMBERS = Array.from({ length: 8 }, (_, i) => i)

// The fires in the door art, located by scanning the image for warm bright blobs rather than by
// eye. Coordinates are percentages OF THE IMAGE, which is why .hero__frame reproduces
// `cover` as a real box instead of using background-size: children positioned in % then crop
// with the art and stay on their fire at every viewport. A glow pinned to the hero element
// instead would slide off the moment the aspect ratio changed.
const FIRES = [
  { x: 28.5, y: 72.2, size: 13, dur: 2.7, delay: 0 },
  { x: 74.0, y: 74.4, size: 12, dur: 3.4, delay: -1.3 }
]

// A full-viewport threshold. The board proper begins below it, so arriving at the site means
// arriving at a door rather than at a list.
//
// The door is a still, given life in CSS. The life is LOCAL: the scene drifts, the seam
// breathes, and each brazier pulses on its own clock. An earlier version animated brightness
// across a full-viewport layer, which strobed the whole screen — see app.css.
export const Hero = ({ count }: Props) => (
  <header className="hero">
    <div className="hero__scene" aria-hidden="true">
      <div className="hero__frame" style={{ backgroundImage: `url(${doorUrl})` }}>
        <div className="hero__seam" />
        {FIRES.map((f, i) => (
          <span
            key={i}
            className="hero__flame"
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              width: `${f.size}%`,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`
            }}
          />
        ))}
      </div>
    </div>

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
