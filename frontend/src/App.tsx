import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useBlocker, useLocation, useNavigate, useSearchParams } from "react-router";
import { api } from "./api";
import { closeLive, useLive } from "./api/live";
import { closeSwipeQueue, queueNotice, swipeQueueFor, useSwipeQueue } from "./api/swipeQueue";
import { Banner } from "./components/Banner/Banner";
import { ConfirmDialog } from "./components/ConfirmDialog/ConfirmDialog";
import { ApiError, type ClosePick, type GroupRef, type LiveSnapshot } from "./api/types";
import { CreateGroup } from "./screens/CreateGroup/CreateGroup";
import { Home } from "./screens/Home/Home";
import { JoinGroup } from "./screens/JoinGroup/JoinGroup";
import { DEFAULT_FILTERS, Lobby, type LobbyFilters } from "./screens/Lobby/Lobby";
import { Match, type MatchedPlace } from "./screens/Match/Match";
import { NoMatch, type ClosePicksLoad } from "./screens/NoMatch/NoMatch";
import { Swipe, type SwipeLoadState } from "./screens/Swipe/Swipe";
import { Waiting } from "./screens/Waiting/Waiting";
import { fromApiFilters, toApiFilters } from "./utils/filters";
import { shareInvite } from "./utils/shareInvite";
import { loadNickname, loadPlace, saveNickname, savePlace } from "./utils/storage";

/** Who you are in the group you're in. Passed between screens as router state (survives a page refresh). */
type GroupSession = GroupRef & {
  code: string;
  /** How many cards this round has (set when swiping starts). */
  total?: number;
  /** The matched place(s), for /match. */
  places?: MatchedPlace[];
  /** Set when the place won a quick vote. */
  vote?: { count: number; total: number };
};

const GROUP_ENDED = "That group has ended. Start a new one, or join another.";

/** The group without this round's details (for going back to the Lobby or on to results). */
function groupOnly({ places: _p, total: _t, vote: _v, ...group }: GroupSession): GroupSession {
  return group;
}

/** Are you the host? The server says so live (it passes to someone else if the host leaves). */
function amHost(session: GroupSession, live: LiveSnapshot) {
  return live.hostId ? live.hostId === session.memberId : session.isHost;
}

/** Turns an error from the server into words people can act on. */
function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  switch (error.code) {
    case "NETWORK":
      return "Can't reach the server. Check your connection and try again.";
    case "RATE_LIMITED":
      return "Too many tries. Wait a minute and try again.";
    case "SERVER_BUSY":
      return "Too many groups are open right now. Try again in a minute.";
    case "NOT_HOST":
      return "Only the host can do that.";
    case "ROUND_STARTED":
      return "The round already started, so the filters are locked.";
    case "NO_VOTE_OPEN":
      return "The vote has closed.";
    case "GROUP_NOT_FOUND":
      return GROUP_ENDED;
    case "INVALID_INPUT":
    case "NUDGE_COOLDOWN":
      return error.message;
    default:
      return "Something went wrong. Try again.";
  }
}

/** Leave for good: tell the server (so you stop counting for matches), drop unsent swipes, hang up. */
function leaveGroup(session: GroupRef) {
  // Best effort: if it doesn't arrive, the group still closes on its own after a while.
  api.leaveGroup(session.groupId, session.memberId).catch(() => {});
  closeSwipeQueue(session);
  closeLive();
}

/** Go back if we came from inside the app, otherwise go to Home (e.g. someone opened /join directly). */
function useGoBack() {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/", { replace: true });
  };
}

/**
 * Moves you along when the server says so: the host started (guests go to Swipe), there's a
 * match, nobody matched, the host started a new round (back to the Lobby), or the group is
 * gone (back to Home with a note).
 */
function useGroupNavigation(
  session: GroupSession | null,
  live: LiveSnapshot,
  follow: { started?: boolean; match?: boolean; noMatch?: boolean; newRound?: boolean; lobby?: boolean },
) {
  const navigate = useNavigate();
  const round = useRef(live.round);

  // The host started a new round: everyone's swipes from last round are gone.
  useEffect(() => {
    if (!session || live.round === round.current) return;
    round.current = live.round;
    swipeQueueFor(session).reset();
    if (follow.newRound) navigate("/lobby", { state: groupOnly(session), replace: true });
  }, [live.round]);

  // A phone that was offline when the new round started finds out from `state` on reconnect:
  // back in the lobby with no result. (Not on Swipe: right after the host taps Start, Swipe
  // can open before `round_started` arrives.)
  const backInLobby = live.members !== null && !live.started && !live.match && !live.noMatch;

  useEffect(() => {
    if (!session) return;
    const group = groupOnly(session);
    if (live.ended) {
      closeLive();
      navigate("/", { replace: true, state: { notice: GROUP_ENDED } });
    } else if (follow.match && live.match) {
      navigate("/match", { state: { ...group, places: [live.match] }, replace: true });
    } else if (follow.noMatch && live.noMatch) {
      navigate("/no-match", { state: group, replace: true });
    } else if (follow.started && live.started) {
      navigate("/swipe", { state: group, replace: true });
    } else if (follow.lobby && backInLobby) {
      swipeQueueFor(session).reset();
      navigate("/lobby", { state: group, replace: true });
    }
  }, [live.ended, live.match, live.noMatch, live.started, backInLobby]);
}

/** "Mia nudged you", for a few seconds after someone nudges you (plus a buzz on Android). */
function useNudgeMessage(live: LiveSnapshot) {
  const [message, setMessage] = useState<string | null>(null);
  const at = live.nudge?.at;
  useEffect(() => {
    if (!live.nudge || Date.now() - live.nudge.at > 10_000) return;
    setMessage(`${live.nudge.from.nickname} nudged you. Keep swiping!`);
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(80);
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [at]);
  return message;
}

/**
 * The browser's Back button (or the iPhone swipe-back gesture) would quietly leave the group,
 * so ask first, like the Leave button does. Render the returned dialog next to the screen.
 */
function useConfirmLeaveOnBack(session: GroupSession | null) {
  const blocker = useBlocker(({ historyAction }) => historyAction === "POP");
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Leave group?"
      confirmLabel="Leave"
      onConfirm={() => {
        if (session) leaveGroup(session);
        blocker.proceed?.();
      }}
      onCancel={() => blocker.reset?.()}
    >
      You can rejoin later with the code.
    </ConfirmDialog>
  );
}

/**
 * Host only: same group, new round. Everyone (you too) goes back to the Lobby when `round_reset`
 * arrives (or, if the connection dropped, when `state` says so on reconnect). Going there before
 * the event would show last round's "started" and bounce you straight to Swipe.
 */
function useNewRound(session: GroupSession | null, live: LiveSnapshot) {
  const [error, setError] = useState("");
  if (!session || !amHost(session, live)) return { start: undefined, error };
  return {
    error,
    start: () => {
      setError("");
      api.newRound(session.groupId, session.memberId).catch((e) => setError(errorMessage(e)));
    },
  };
}

function HomeRoute() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  return (
    <Home
      locationLabel={loadPlace()?.label}
      notice={notice}
      onCreateGroup={() => navigate("/create")}
      onJoinWithCode={() => navigate("/join")}
      onChangeLocation={() => navigate("/create")}
    />
  );
}

function CreateRoute() {
  const navigate = useNavigate();
  const goBack = useGoBack();
  return (
    <CreateGroup
      initialName={loadNickname()}
      initialPlace={loadPlace()}
      onBack={goBack}
      onSearch={(query) => api.geocode(query)}
      errorMessage={errorMessage}
      onCreate={async (nickname, place) => {
        // Default filters for now; the host changes them in the Lobby.
        const group = await api.createGroup(nickname, { lat: place.lat, lng: place.lng }, toApiFilters(DEFAULT_FILTERS));
        saveNickname(nickname);
        savePlace(place);
        closeLive();
        const session: GroupSession = {
          groupId: group.groupId,
          memberId: group.memberId,
          code: group.joinCode,
          nickname,
          isHost: true,
        };
        navigate("/lobby", { state: session, replace: true });
      }}
    />
  );
}

function JoinRoute() {
  const goBack = useGoBack();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <JoinGroup
      initialName={loadNickname()}
      initialCode={params.get("code") ?? ""}
      onBack={goBack}
      onJoin={(code, nickname) => api.joinGroup(code, nickname)}
      onJoined={(result, nickname, code) => {
        saveNickname(nickname);
        closeLive();
        const session: GroupSession = {
          groupId: result.groupId,
          memberId: result.memberId,
          code,
          nickname,
          isHost: false,
        };
        // Replace so Back from the Lobby goes Home, not to the filled-in Join form.
        navigate("/lobby", { state: session, replace: true });
      }}
    />
  );
}

function LobbyRoute() {
  const navigate = useNavigate();
  const session = useLocation().state as GroupSession | null;
  const live = useLive(session);
  const isHost = session ? amHost(session, live) : false;
  // The host's own picks; until they touch anything, show what the server has.
  const [picked, setPicked] = useState<LobbyFilters | null>(null);
  const [error, setError] = useState("");
  const pending = useRef<{ timer: number; filters: LobbyFilters } | null>(null);

  useGroupNavigation(session, live, { started: true });
  const confirmLeave = useConfirmLeaveOnBack(session);

  const sendFilters = useCallback(
    (filters: LobbyFilters) =>
      session ? api.updateFilters(session.groupId, session.memberId, toApiFilters(filters)) : Promise.resolve(),
    [session?.groupId, session?.memberId],
  );
  useEffect(() => () => window.clearTimeout(pending.current?.timer), []);

  if (!session) return <Navigate to="/" replace />;

  const filters = (isHost && picked) || fromApiFilters(live.filters, DEFAULT_FILTERS);

  return (
    <>
      <Lobby
        code={session.code}
        members={live.members}
        myId={session.memberId}
        isHost={isHost}
        filters={filters}
        error={error}
        onFiltersChange={(next) => {
          setPicked(next);
          setError("");
          // Send the host's filters a moment after they stop tapping.
          window.clearTimeout(pending.current?.timer);
          pending.current = {
            filters: next,
            timer: window.setTimeout(() => {
              pending.current = null;
              sendFilters(next).catch((e) =>
                setError(e instanceof ApiError && e.status !== 0 ? errorMessage(e) : "Couldn't save the filters. Check your connection."),
              );
            }, 300),
          };
        }}
        onShareInvite={() => shareInvite(session.code)}
        onStart={async () => {
          setError("");
          try {
            // Send any filter change that's still waiting, then start everyone.
            if (pending.current) {
              window.clearTimeout(pending.current.timer);
              const { filters: last } = pending.current;
              pending.current = null;
              await sendFilters(last);
            }
            await api.startRound(session.groupId, session.memberId);
            navigate("/swipe", { state: groupOnly(session), replace: true });
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
        onLeave={() => {
          leaveGroup(session);
          navigate("/", { replace: true });
        }}
      />
      {confirmLeave}
    </>
  );
}

function SwipeRoute() {
  const navigate = useNavigate();
  const session = useLocation().state as GroupSession | null;
  const live = useLive(session);
  const [load, setLoad] = useState<SwipeLoadState>({ status: "loading" });
  const queue = useSwipeQueue(session);
  const confirmLeave = useConfirmLeaveOnBack(session);
  const nudge = useNudgeMessage(live);
  const newRound = useNewRound(session, live);

  useGroupNavigation(session, live, { match: true, noMatch: true, newRound: true });

  // A swipe's answer can say match / no match before the live update arrives.
  useEffect(() => {
    if (!session) return;
    const group = groupOnly(session);
    if (queue.ended) {
      closeLive();
      navigate("/", { replace: true, state: { notice: GROUP_ENDED } });
    } else if (queue.match) {
      // Use the full card (photo, price…) when we have it; the swipe answer only has the id.
      const restaurants = load.status === "ready" ? load.restaurants : [];
      const place = restaurants.find((r) => r.id === queue.match);
      if (place) navigate("/match", { state: { ...group, places: [place] }, replace: true });
    } else if (queue.noMatch) {
      navigate("/no-match", { state: group, replace: true });
    }
  }, [queue.ended, queue.match, queue.noMatch]);

  const fetchRestaurants = useCallback(() => {
    if (!session) return;
    setLoad({ status: "loading" });
    api
      .getRestaurants(session.groupId, session.memberId)
      .then((restaurants) => setLoad({ status: "ready", restaurants }))
      .catch(() => setLoad({ status: "error" }));
  }, [session?.groupId, session?.memberId]);

  useEffect(fetchRestaurants, [fetchRestaurants]);

  if (!session) return <Navigate to="/" replace />;
  const group = groupOnly(session);
  // After a refresh, start at the first card you haven't swiped yet.
  const swiped = swipeQueueFor(session).swipedIds();
  const restaurants = load.status === "ready" ? load.restaurants : [];
  const firstUnswiped = restaurants.findIndex((r) => !swiped.has(r.id));

  return (
    <>
      <Banner message={nudge ?? newRound.error} />
      <Swipe
        load={load}
        initialIndex={firstUnswiped === -1 ? restaurants.length : firstUnswiped}
        notice={queueNotice(queue)}
        onRetry={fetchRestaurants}
        // Nothing matched: the cards are locked in for this round, so the host starts a new one.
        onChangeFilters={newRound.start}
        // Queued and sent in the background, so the next card shows right away. A swipe that
        // can't be sent (bad connection) waits and retries; the screen says so.
        onSwipe={(restaurant, liked) => swipeQueueFor(session).add(restaurant.id, liked)}
        onFinished={() => {
          const total = load.status === "ready" ? load.restaurants.length : undefined;
          navigate("/waiting", { state: { ...group, total }, replace: true });
        }}
        onLeave={() => {
          leaveGroup(session);
          navigate("/", { replace: true });
        }}
      />
      {confirmLeave}
    </>
  );
}

function WaitingRoute() {
  const navigate = useNavigate();
  const session = useLocation().state as GroupSession | null;
  const live = useLive(session);
  const queue = useSwipeQueue(session);
  const confirmLeave = useConfirmLeaveOnBack(session);
  const [error, setError] = useState("");

  useGroupNavigation(session, live, { match: true, noMatch: true, newRound: true, lobby: true });

  if (!session) return <Navigate to="/" replace />;
  const { groupId, memberId } = session;

  // Everyone's progress. Someone with no swipes yet has no entry, so count them at 0.
  const total = Math.max(session.total ?? 0, ...Object.values(live.progress).map((p) => p.total));
  const members =
    live.members?.map((m) => ({ ...m, ...(live.progress[m.id] ?? (total ? { swiped: 0, total } : {})) })) ?? null;

  return (
    <>
      <Waiting
        members={members}
        notice={error || queueNotice(queue)}
        myId={memberId}
        isHost={amHost(session, live)}
        onNudge={(ids) =>
          api.nudge(groupId, memberId, ids).catch((e) => {
            // Already nudged them in the last minute: the button's countdown is right as it is.
            if (e instanceof ApiError && e.code === "NUDGE_COOLDOWN") return;
            throw e;
          })
        }
        onEndRound={() => {
          setError("");
          api
            .endRound(groupId, memberId)
            // The live update says match or no match; go now in case it's slow.
            .then(() => !live.match && navigate("/no-match", { state: groupOnly(session), replace: true }))
            .catch((e) => setError(errorMessage(e)));
        }}
      />
      {confirmLeave}
    </>
  );
}

function MatchRoute() {
  const session = useLocation().state as GroupSession | null;
  const live = useLive(session);
  const newRound = useNewRound(session, live);
  const [places, setPlaces] = useState<MatchedPlace[]>(session?.places ?? []);

  useGroupNavigation(session, live, { newRound: true, lobby: true });

  // match_found only sends name, address, hours and location: fill in the photo, price… from the stack.
  useEffect(() => {
    if (!session || places.every((p) => "photoUrl" in p)) return;
    api
      .getRestaurants(session.groupId, session.memberId)
      .then((stack) => setPlaces((current) => current.map((p) => stack.find((r) => r.id === p.id) ?? p)))
      .catch(() => {});
  }, [session?.groupId]);

  if (!session?.places?.length) return <Navigate to="/" replace />;
  const me = { id: session.memberId, nickname: session.nickname };

  return (
    <Match
      places={places}
      members={live.members ?? [me]}
      vote={session.vote}
      onNewRound={newRound.start}
      error={newRound.error}
    />
  );
}

function NoMatchRoute() {
  const navigate = useNavigate();
  const session = useLocation().state as GroupSession | null;
  const live = useLive(session);
  const newRound = useNewRound(session, live);
  const [load, setLoad] = useState<ClosePicksLoad>({ status: "loading" });
  const members = live.members ?? (session ? [{ id: session.memberId, nickname: session.nickname }] : []);

  useGroupNavigation(session, live, { newRound: true, lobby: true });

  // The vote's winner (or a late match) arrives as match_found. Everyone goes, voted or not.
  useEffect(() => {
    if (!session || !live.match) return;
    const result = live.voteResult;
    const vote = result
      ? { count: result.votes[result.winnerId] ?? 0, total: Object.values(result.votes).reduce((a, b) => a + b, 0) }
      : undefined;
    navigate("/match", { state: { ...groupOnly(session), places: [live.match], vote }, replace: true });
  }, [live.match]);

  // The closest picks, with the full cards (photo, price…) from this round's stack.
  const fetchPicks = useCallback(() => {
    if (!session) return;
    setLoad({ status: "loading" });
    Promise.all([api.getResults(session.groupId, session.memberId), api.getRestaurants(session.groupId, session.memberId)])
      .then(([results, stack]) => {
        const picks = results.flatMap(({ restaurantId, likes }): ClosePick[] => {
          const restaurant = stack.find((r) => r.id === restaurantId);
          return restaurant ? [{ restaurant, likes }] : [];
        });
        setLoad({ status: "ready", picks });
      })
      .catch(() => setLoad({ status: "error" }));
  }, [session?.groupId, session?.memberId]);

  useEffect(fetchPicks, [fetchPicks]);

  if (!session) return <Navigate to="/" replace />;

  return (
    <NoMatch
      load={load}
      memberCount={live.vote?.total ?? members.length}
      votesIn={live.vote?.votesIn}
      onRetry={fetchPicks}
      onVote={async (restaurantId) => {
        try {
          await api.vote(session.groupId, session.memberId, restaurantId);
        } catch (e) {
          throw new Error(
            e instanceof ApiError && e.code === "NO_VOTE_OPEN" ? errorMessage(e) : "Your vote didn't go through. Try again.",
          );
        }
      }}
      onChangeFilters={newRound.start}
      error={newRound.error}
      onHome={() => {
        leaveGroup(session);
        navigate("/", { replace: true });
      }}
    />
  );
}

// A "data router" (not <BrowserRouter>) so screens can ask before the Back button leaves.
const router = createBrowserRouter([
  { path: "/", element: <HomeRoute /> },
  { path: "/create", element: <CreateRoute /> },
  { path: "/join", element: <JoinRoute /> },
  { path: "/lobby", element: <LobbyRoute /> },
  { path: "/swipe", element: <SwipeRoute /> },
  { path: "/waiting", element: <WaitingRoute /> },
  { path: "/match", element: <MatchRoute /> },
  { path: "/no-match", element: <NoMatchRoute /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
