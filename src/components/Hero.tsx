import doorUrl from '../assets/hero/door.jpg'

type Props = { count: number }

// A full-viewport threshold. The board proper begins below it, so arriving at the site means
// arriving at a door rather than at a list — and the art gets seen at full size by everyone,
// including on touch and in a screenshot, which the hover flood cannot do.
export const Hero = ({ count }: Props) => (
  <header className="hero" style={{ backgroundImage: `url(${doorUrl})` }}>
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
