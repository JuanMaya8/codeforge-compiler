import { EXAMPLE_GROUPS, EXAMPLES, type ExampleGroup, type ExampleProgram } from '../../examples/programs';
import './ExampleSelector.css';

interface ExampleSelectorProps {
  activeId: string | null;
  onSelect: (example: ExampleProgram) => void;
}

const GROUP_ORDER: ExampleGroup[] = ['language', 'errors'];

/** Sidebar list of examples, grouped. Shown on wide screens. */
export function ExampleList({ activeId, onSelect }: ExampleSelectorProps) {
  return (
    <nav className="example-list" aria-label="Programas de ejemplo">
      {GROUP_ORDER.map((group) => (
        <div key={group} className="example-list__group">
          <h3 className="example-list__heading">{EXAMPLE_GROUPS[group]}</h3>
          <ul>
            {EXAMPLES.filter((example) => example.group === group).map((example) => (
              <li key={example.id}>
                <button
                  type="button"
                  className={`example-list__item ${example.id === activeId ? 'example-list__item--active' : ''} example-list__item--${example.group}`}
                  aria-current={example.id === activeId ? 'true' : undefined}
                  onClick={() => onSelect(example)}
                >
                  <span className="example-list__title">{example.title}</span>
                  <span className="example-list__description">{example.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Compact dropdown with the same examples, used in the editor toolbar. */
export function ExampleSelect({ activeId, onSelect }: ExampleSelectorProps) {
  return (
    <label className="example-select">
      <span className="visually-hidden">Cargar un ejemplo</span>
      <select
        value={activeId ?? ''}
        onChange={(event) => {
          const example = EXAMPLES.find((item) => item.id === event.target.value);
          if (example) onSelect(example);
        }}
      >
        <option value="" disabled>
          Cargar ejemplo…
        </option>
        {GROUP_ORDER.map((group) => (
          <optgroup key={group} label={EXAMPLE_GROUPS[group]}>
            {EXAMPLES.filter((example) => example.group === group).map((example) => (
              <option key={example.id} value={example.id}>
                {example.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
