import { LANES, TIMELINE, laneSpans, type LaneId } from "@/data/timeline";

/** One row's slice of the branch graph: lines through, and a commit node. */
function Graph({ row, node, head }: { row: number; node?: LaneId; head?: boolean }) {
  const spans = laneSpans();
  return (
    <div className="graph" aria-hidden>
      {LANES.map((lane) => {
        const { top, bottom } = spans[lane.id];
        const above = row > top && row <= bottom;
        const below = row >= top && row < bottom;
        return (
          <span key={lane.id} className="graph__lane" style={{ "--tone": lane.tone } as React.CSSProperties}>
            {above && <i className="graph__line graph__line--above" />}
            {below && <i className="graph__line graph__line--below" />}
            {node === lane.id && <i className="graph__node" />}
            {head && above === false && below && <i className="graph__node graph__node--head" />}
          </span>
        );
      })}
    </div>
  );
}

export function Timeline() {
  return (
    <ol className="timeline">
      <li className="commit commit--head" data-reveal>
        <Graph row={0} head />
        <p className="commit__date">now</p>
        <div className="commit__body">
          <p className="commit__refs">
            <span className="ref ref--head">HEAD → main</span>
            {LANES.filter((l) => laneSpans()[l.id].top === 0).map((l) => (
              <span key={l.id} className="ref" style={{ "--tone": l.tone } as React.CSSProperties}>
                {l.label}
              </span>
            ))}
          </p>
          <p className="commit__summary">Leading teams at hedgehog lab, and building gitgood.io on the side.</p>
        </div>
      </li>

      {TIMELINE.map((event, i) => {
        const lane = LANES.find((l) => l.id === event.lane)!;
        const hasMore = Boolean(event.points?.length || event.engagements?.length);
        return (
          <li
            key={event.id}
            className="commit"
            data-reveal
            style={{ "--tone": lane.tone } as React.CSSProperties}
          >
            <Graph row={i + 1} node={event.lane} />
            <p className="commit__date">{event.date}</p>
            <div className="commit__body">
              <p className="commit__refs">
                <span className="ref">{event.ref}</span>
                {event.period && <span className="commit__period">{event.period}</span>}
              </p>
              <h3 className="commit__title">
                {event.title}
                <span>
                  {event.link ? (
                    <a className="link" href={event.link} target="_blank" rel="noreferrer">
                      {event.org}
                    </a>
                  ) : (
                    event.org
                  )}
                </span>
              </h3>
              <p className="commit__summary">{event.summary}</p>

              {hasMore && (
                <details className="commit__more">
                  <summary>show details</summary>
                  {event.points && (
                    <ul className="commit__points">
                      {event.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                  {event.engagements && (
                    <div className="commit__engagements">
                      {event.engagements.map((e) => (
                        <div key={e.name}>
                          <p className="commit__engagement">{e.name}</p>
                          <p>{e.summary}</p>
                          <p className="commit__stack">{e.stack.join(" / ")}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              )}

              {event.stack && <p className="commit__stack">{event.stack.join(" / ")}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
