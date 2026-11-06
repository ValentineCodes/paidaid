import { useMemo, useState } from "react";

type IconName =
  | "home"
  | "activity"
  | "message"
  | "bell"
  | "user"
  | "search"
  | "plus"
  | "moon"
  | "sun"
  | "arrow"
  | "pin"
  | "clock"
  | "chevron"
  | "close"
  | "filter"
  | "camera"
  | "check"
  | "send"
  | "attach"
  | "star"
  | "briefcase"
  | "spark"
  | "shield";

const paths: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v11h14V10M9 21v-7h6v7" />
    </>
  ),
  activity: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
    </>
  ),
  message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  camera: (
    <>
      <path d="M4 7h3l2-3h6l2 3h3v13H4Z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  send: <path d="m3 3 18 9-18 9 4-9Zm4 9h14" />,
  attach: (
    <path d="m20 12-8.5 8.5a5 5 0 0 1-7-7L14 4a3 3 0 0 1 4 4l-9.5 9.5a1 1 0 0 1-1.5-1.5L16 7" />
  ),
  star: <path d="m12 2 3 6 7 .9-5 4.8 1.3 6.8-6.3-3.3-6.3 3.3L7 13.7 2 8.9 9 8Z" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />,
};

function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

type Task = {
  id: number;
  title: string;
  budget: string;
  category: string;
  type: string;
  place: string;
  due: string;
  time: string;
  description: string;
  color: string;
  offers: number;
};

const tasks: Task[] = [
  {
    id: 1,
    title: "Help me set up a home studio",
    budget: "320 USDC",
    category: "Creative",
    type: "In person",
    place: "Brooklyn, NY",
    due: "Due Jun 28",
    time: "18 min ago",
    description:
      "I’m looking for someone with audio experience to help position acoustic panels, connect a small interface, and get clean levels for voice recording.",
    color: "orange",
    offers: 4,
  },
  {
    id: 2,
    title: "Design a simple event poster",
    budget: "180 USDC",
    category: "Design",
    type: "Online",
    place: "Remote",
    due: "Due Jul 02",
    time: "42 min ago",
    description:
      "Need a bold poster for a neighborhood music night. Assets and copy are ready. Looking for one main design plus social crops.",
    color: "violet",
    offers: 7,
  },
  {
    id: 3,
    title: "Photograph my vintage furniture",
    budget: "250 USDC",
    category: "Photography",
    type: "In person",
    place: "Austin, TX",
    due: "Due Jun 30",
    time: "1 hr ago",
    description:
      "Photograph six restored mid-century pieces in natural light for an online listing. Basic editing and full-resolution exports included.",
    color: "blue",
    offers: 3,
  },
  {
    id: 4,
    title: "Translate product guide to Spanish",
    budget: "140 USDC",
    category: "Writing",
    type: "Online",
    place: "Remote",
    due: "Due Jul 04",
    time: "2 hrs ago",
    description:
      "Translate a friendly 1,600-word product setup guide from English into natural Latin American Spanish.",
    color: "green",
    offers: 9,
  },
  {
    id: 5,
    title: "Assemble two flat-pack wardrobes",
    budget: "210 USDC",
    category: "Home",
    type: "In person",
    place: "Queens, NY",
    due: "Due Jun 29",
    time: "3 hrs ago",
    description:
      "Two new wardrobes need assembly this weekend. Tools are available, but feel free to bring your own.",
    color: "pink",
    offers: 5,
  },
  {
    id: 6,
    title: "Audit my community newsletter",
    budget: "95 USDC",
    category: "Writing",
    type: "Online",
    place: "Remote",
    due: "Due Jul 06",
    time: "4 hrs ago",
    description:
      "Review the last four editions and suggest ways to improve structure, clarity, and subscriber engagement.",
    color: "yellow",
    offers: 2,
  },
];

const nav = [
  { id: "home", label: "Discover", icon: "home" as IconName },
  { id: "activity", label: "Activity", icon: "activity" as IconName },
  { id: "messages", label: "Messages", icon: "message" as IconName },
  { id: "notifications", label: "Updates", icon: "bell" as IconName },
];

function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        <span />
      </span>
      <span>PaidAid</span>
    </div>
  );
}

function Header({
  page,
  setPage,
  dark,
  setDark,
  onCreate,
}: {
  page: string;
  setPage: (v: string) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
  onCreate: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button onClick={() => setPage("home")} aria-label="Go home">
          <Logo />
        </button>
        <nav className="desktop-nav">
          {nav.slice(0, 4).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              {item.label}
              {item.id === "notifications" && <i />}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="icon-button theme-toggle"
            onClick={() => setDark(!dark)}
            aria-label="Toggle theme"
          >
            <Icon name={dark ? "sun" : "moon"} />
          </button>
          <button className="create-button" onClick={onCreate}>
            <Icon name="plus" size={18} /> Post a task
          </button>
          <button className="avatar" onClick={() => setPage("profile")} aria-label="Open profile">
            AM
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <button className="task-card" onClick={onClick}>
      <div className="card-top">
        <span className={`category-dot ${task.color}`} />
        <span>{task.category}</span>
        <span className="posted">{task.time}</span>
      </div>
      <h3>{task.title}</h3>
      <div className="budget">{task.budget}</div>
      <div className="meta-row">
        <span>
          <Icon name={task.type === "Online" ? "spark" : "pin"} size={16} />
          {task.place}
        </span>
        <span>
          <Icon name="clock" size={16} />
          {task.due}
        </span>
      </div>
      <div className="card-foot">
        <span>{task.offers} offers</span>
        <span className="view-link">
          View task <Icon name="arrow" size={16} />
        </span>
      </div>
    </button>
  );
}

function Home({ onSelect, onCreate }: { onSelect: (task: Task) => void; onCreate: () => void }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All tasks");
  const categories = ["All tasks", "Design", "Creative", "Home", "Photography", "Writing"];
  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (category === "All tasks" || t.category === category) &&
          t.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [category, search],
  );
  return (
    <main>
      <section className="hero">
        <div className="eyebrow">
          <span /> Open marketplace · Built for people
        </div>
        <h1>
          If you can pay for it,
          <br />
          <em>someone can do it.</em>
        </h1>
        <p>
          Real people, useful work, direct connection. Post what you need or find something worth
          doing.
        </p>
        <div className="search-wrap">
          <Icon name="search" size={22} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="What can you help with?"
            aria-label="Search tasks"
          />
          <button onClick={() => setSearch(search.trim())}>Search</button>
        </div>
        <div className="trust-row">
          <span>
            <Icon name="shield" size={16} /> Human verified
          </span>
          <span>
            <Icon name="message" size={16} /> Direct messaging
          </span>
          <span>
            <Icon name="briefcase" size={16} /> One account, both ways
          </span>
        </div>
      </section>

      <section className="market">
        <div className="section-head">
          <div>
            <span className="section-kicker">THE MARKETPLACE</span>
            <h2>Work worth doing</h2>
          </div>
          <button className="text-button" onClick={onCreate}>
            Post what you need <Icon name="arrow" size={17} />
          </button>
        </div>
        <div className="filters">
          <div className="category-tabs">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={category === c ? "active" : ""}
              >
                {c}
              </button>
            ))}
          </div>
          <button className="filter-button">
            <Icon name="filter" size={17} /> Filters
          </button>
        </div>
        <div className="result-count">
          <span>{filtered.length} open tasks</span>
          <button>
            Newest first <Icon name="chevron" size={14} />
          </button>
        </div>
        <div className="task-grid">
          {filtered.map((t) => (
            <TaskCard key={t.id} task={t} onClick={() => onSelect(t)} />
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="empty">
            <Icon name="search" size={30} />
            <h3>No tasks found</h3>
            <p>Try a broader search or another category.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function DetailDrawer({ task, onClose }: { task: Task; onClose: () => void }) {
  const [offering, setOffering] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="detail-drawer">
        <button className="drawer-close" onClick={onClose}>
          <Icon name="close" />
        </button>
        <div className="detail-content">
          <div className="card-top">
            <span className={`category-dot ${task.color}`} />
            <span>{task.category}</span>
            <span className="posted">{task.time}</span>
          </div>
          <h2>{task.title}</h2>
          <div className="detail-budget">
            {task.budget}
            <span>Informational budget</span>
          </div>
          <div className="detail-meta">
            <div>
              <Icon name="pin" />
              <span>
                <small>LOCATION</small>
                {task.place} · {task.type}
              </span>
            </div>
            <div>
              <Icon name="clock" />
              <span>
                <small>DEADLINE</small>
                {task.due.replace("Due ", "")}
              </span>
            </div>
          </div>
          <div className="detail-section">
            <h4>About this task</h4>
            <p>{task.description}</p>
          </div>
          <div className="detail-section">
            <h4>Posted by</h4>
            <div className="requester">
              <div className="avatar large">JK</div>
              <div>
                <strong>Jordan Kim</strong>
                <span>
                  <Icon name="star" size={14} /> 4.9 · 18 reviews
                </span>
              </div>
              <span className="verified">
                <Icon name="check" size={12} /> Verified
              </span>
            </div>
          </div>
          {!offering && (
            <button className="primary-wide" onClick={() => setOffering(true)}>
              Make an offer <Icon name="arrow" size={18} />
            </button>
          )}
          {offering && !sent && (
            <div className="offer-form">
              <div className="offer-title">
                <div>
                  <span>YOUR OFFER</span>
                  <h3>How can you help?</h3>
                </div>
                <button onClick={() => setOffering(false)}>
                  <Icon name="close" size={18} />
                </button>
              </div>
              {!captured && (
                <div className="camera-gate">
                  <div className="camera-icon">
                    <Icon name="camera" />
                  </div>
                  <div>
                    <strong>Photo check required</strong>
                    <p>
                      Capture a profile photo in-app before responding. It helps keep PaidAid human.
                    </p>
                  </div>
                  <button onClick={() => setCaptured(true)}>Open camera</button>
                </div>
              )}
              <label>
                Offer amount
                <div className="amount-input">
                  <input defaultValue={task.budget.split(" ")[0]} />
                  <span>USDC</span>
                </div>
              </label>
              <label>
                Message
                <textarea placeholder="Introduce yourself and explain how you’d approach this task..." />
              </label>
              <button className="primary-wide" disabled={!captured} onClick={() => setSent(true)}>
                Send offer <Icon name="send" size={17} />
              </button>
            </div>
          )}
          {sent && (
            <div className="sent-state">
              <span>
                <Icon name="check" />
              </span>
              <h3>Offer sent</h3>
              <p>Jordan will be notified. You can follow the conversation in Messages.</p>
              <button onClick={onClose}>Back to tasks</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [published, setPublished] = useState(false);
  return (
    <div className="overlay modal-overlay">
      <div className="create-modal">
        <div className="modal-head">
          <Logo />
          <button onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {!published ? (
          <>
            <div className="step-line">
              <span className={step >= 1 ? "on" : ""} />
              <span className={step >= 2 ? "on" : ""} />
              <span className={step >= 3 ? "on" : ""} />
            </div>
            <div className="form-intro">
              <span>STEP {step} OF 3</span>
              <h2>
                {step === 1
                  ? "What do you need done?"
                  : step === 2
                    ? "Set the details"
                    : "Review your task"}
              </h2>
              <p>
                {step === 1
                  ? "A clear brief helps the right people find you."
                  : step === 2
                    ? "Help people understand the scope and timing."
                    : "Make sure everything looks right before publishing."}
              </p>
            </div>
            {step === 1 && (
              <div className="form-fields">
                <label>
                  Task title
                  <input placeholder="e.g. Help photograph my new products" />
                </label>
                <label>
                  Description
                  <textarea placeholder="Describe what needs doing, what success looks like, and any helpful context..." />
                </label>
                <div className="photo-upload">
                  <Icon name="camera" />
                  <div>
                    <strong>Add photos</strong>
                    <span>Up to 5 · JPG or PNG</span>
                  </div>
                  <button>Choose files</button>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="form-fields">
                <div className="two-col">
                  <label>
                    Budget
                    <div className="amount-input">
                      <input placeholder="250" />
                      <span>USDC</span>
                    </div>
                  </label>
                  <label>
                    Deadline
                    <input type="date" />
                  </label>
                </div>
                <label>
                  How will this happen?
                  <div className="choice-row">
                    <button className="selected">
                      <Icon name="spark" />
                      Online
                    </button>
                    <button>
                      <Icon name="pin" />
                      In person
                    </button>
                  </div>
                </label>
                <label>
                  Category
                  <select defaultValue="Creative">
                    <option>Creative</option>
                    <option>Design</option>
                    <option>Home</option>
                    <option>Writing</option>
                    <option>Photography</option>
                  </select>
                </label>
              </div>
            )}
            {step === 3 && (
              <div className="review-card">
                <div className="review-image">
                  <Icon name="briefcase" size={30} />
                </div>
                <span>CREATIVE · ONLINE</span>
                <h3>Help photograph my new products</h3>
                <p>
                  Looking for a photographer to create a clean set of product images for our
                  upcoming launch.
                </p>
                <div>
                  <strong>250 USDC</strong>
                  <span>Due Jul 12</span>
                </div>
                <small>
                  Crypto budgets are informational only. PaidAid does not process payments in V1.
                </small>
              </div>
            )}
            <div className="modal-actions">
              {step > 1 ? (
                <button className="secondary" onClick={() => setStep(step - 1)}>
                  Back
                </button>
              ) : (
                <button className="secondary" onClick={onClose}>
                  Cancel
                </button>
              )}
              <button
                className="primary"
                onClick={() => (step < 3 ? setStep(step + 1) : setPublished(true))}
              >
                {step === 3 ? "Publish task" : "Continue"}
                <Icon name="arrow" size={17} />
              </button>
            </div>
          </>
        ) : (
          <div className="published">
            <span>
              <Icon name="check" size={28} />
            </span>
            <h2>Your task is live</h2>
            <p>
              People can now discover it and send you offers. We’ll let you know when someone
              responds.
            </p>
            <button className="primary" onClick={onClose}>
              Browse marketplace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityPage({ onCreate }: { onCreate: () => void }) {
  const [tab, setTab] = useState("Posted");
  return (
    <PageShell
      kicker="YOUR WORK"
      title="Activity"
      subtitle="Everything you’ve posted, offered on, and started."
    >
      <div className="segment">
        {["Posted", "Offers", "In progress", "Completed"].map((t) => (
          <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>
            {t}
            <span>{t === "Posted" ? 2 : t === "Offers" ? 3 : t === "In progress" ? 1 : 8}</span>
          </button>
        ))}
      </div>
      <div className="activity-list">
        <div className="activity-card">
          <span className="status open">OPEN · 7 RESPONSES</span>
          <h3>Design a simple event poster</h3>
          <div>
            <span>180 USDC</span>
            <span>Due Jul 02</span>
          </div>
          <button>
            Compare offers <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="activity-card">
          <span className="status review">IN REVIEW · 3 RESPONSES</span>
          <h3>Help organize my home office</h3>
          <div>
            <span>160 USDC</span>
            <span>Due Jun 30</span>
          </div>
          <button>
            View responses <Icon name="arrow" size={16} />
          </button>
        </div>
        <button className="new-task-card" onClick={onCreate}>
          <Icon name="plus" />
          <span>
            <strong>Post another task</strong>
            <small>Tell the community what you need.</small>
          </span>
        </button>
      </div>
    </PageShell>
  );
}

function MessagesPage() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    "I can come by Saturday morning. I’ve set up several home studios and can bring a calibration mic.",
    "That sounds perfect. Would 10am work?",
  ]);
  return (
    <PageShell kicker="CONVERSATIONS" title="Messages" subtitle="Keep every task moving.">
      <div className="messages-shell">
        <div className="conversation-list">
          <div className="conversation active">
            <div className="avatar coral">
              RS
              <span />
            </div>
            <div>
              <strong>Riley Shah</strong>
              <p>I can come by Saturday...</p>
            </div>
            <time>2m</time>
          </div>
          <div className="conversation">
            <div className="avatar blue">MN</div>
            <div>
              <strong>Maya N.</strong>
              <p>Just sent over the first...</p>
            </div>
            <time>1h</time>
          </div>
        </div>
        <div className="chat">
          <div className="chat-head">
            <div className="avatar coral">
              RS
              <span />
            </div>
            <div>
              <strong>Riley Shah</strong>
              <span>Home studio setup · Active</span>
            </div>
            <button>
              <Icon name="pin" size={17} /> Share location
            </button>
          </div>
          <div className="chat-body">
            <div className="day">TODAY</div>
            <div className="bubble theirs">
              {messages[0]}
              <time>9:42 AM</time>
            </div>
            <div className="bubble mine">
              {messages[1]}
              <time>9:45 AM</time>
            </div>
            {messages.slice(2).map((m, i) => (
              <div className="bubble mine" key={i}>
                {m}
                <time>Now</time>
              </div>
            ))}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              if (message.trim()) {
                setMessages([...messages, message]);
                setMessage("");
              }
            }}
          >
            <button type="button">
              <Icon name="attach" />
            </button>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a message..."
            />
            <button className="send" type="submit">
              <Icon name="send" size={18} />
            </button>
          </form>
        </div>
      </div>
    </PageShell>
  );
}

function NotificationsPage() {
  return (
    <PageShell
      kicker="STAY IN THE LOOP"
      title="Updates"
      subtitle="Responses, messages, and progress in one place."
    >
      <div className="updates-list">
        {[
          [
            "message",
            "New message from Riley",
            "“I can come by Saturday morning...”",
            "2 min ago",
            "new",
          ],
          [
            "briefcase",
            "You received a new offer",
            "Maya offered 165 USDC for your event poster.",
            "38 min ago",
            "new",
          ],
          [
            "check",
            "Work submitted for review",
            "Theo submitted files for “Newsletter audit”.",
            "Yesterday",
            "",
          ],
          [
            "star",
            "Time to leave a review",
            "How was your experience working with Sam?",
            "2 days ago",
            "",
          ],
        ].map(([icon, title, text, time, state]) => (
          <button className={`update ${state}`} key={title}>
            <span className="update-icon">
              <Icon name={icon as IconName} />
            </span>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
            <time>{time}</time>
            {state && <i />}
          </button>
        ))}
      </div>
    </PageShell>
  );
}

function PageShell({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="inner-page">
      <div className="page-heading">
        <span>{kicker}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </main>
  );
}

function MobileNav({ page, setPage }: { page: string; setPage: (v: string) => void }) {
  return (
    <nav className="mobile-nav">
      {nav.map((item) => (
        <button
          key={item.id}
          className={page === item.id ? "active" : ""}
          onClick={() => setPage(item.id)}
        >
          <span>
            <Icon name={item.icon} size={20} />
            {item.id === "notifications" && <i />}
          </span>
          <small>{item.label}</small>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const [page, setPage] = useState("home");
  const [dark, setDark] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className={dark ? "app dark" : "app"}>
      <Header
        page={page}
        setPage={setPage}
        dark={dark}
        setDark={setDark}
        onCreate={() => setCreating(true)}
      />
      {page === "home" && <Home onSelect={setSelected} onCreate={() => setCreating(true)} />}
      {page === "activity" && <ActivityPage onCreate={() => setCreating(true)} />}
      {page === "messages" && <MessagesPage />}
      {page === "notifications" && <NotificationsPage />}
      <MobileNav page={page} setPage={setPage} />
      {selected && <DetailDrawer task={selected} onClose={() => setSelected(null)} />}
      {creating && <CreateModal onClose={() => setCreating(false)} />}
    </div>
  );
}
