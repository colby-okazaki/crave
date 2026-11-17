import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useBlocker, useLocation, useNavigate, useSearchParams } from "react-router";
import { api } from "./api";
import { closeLive, useLive } from "./api/live";
import { queueNotice, swipeQueueFor, useSwipeQueue } from "./api/swipeQueue";
import { ConfirmDialog } from "./components/ConfirmDialog/ConfirmDialog";
import { ApiError, type GroupRef, type LiveSnapshot, type MemberProgress, type Restaurant } from "./api/types";
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

/** The group without this round's details (for going back to the Lobby or on to results). */
function groupOnly({ places: _p, total: _t, vote: _v, ...group }: GroupSession): GroupSession {
  return group;
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
    case "INVALID_INPUT":
      return error.message;
    default:
      return "Something went wrong. Try again.";
  }
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
 * match, nobody matched, or the group is gone (back to Home with a note).
 */
function useGroupNavigation(session: GroupSession | null, live: LiveSnapshot, follow: { started?: boolean; results?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!session) return;
    const group = groupOnly(session);
    if (live.ended) {
      closeLive();
      navigate("/", { replace: true, state: { notice: "That group has ended. Start a new one, or join another." } });
    } else if (follow.results && live.match) {
      navigate("/match", { state: { ...group, places: [live.match] }, replace: true });
    } else if (follow.results && live.noMatch) {
      navigate("/no-match", { state: group, replace: true });
    } else if (follow.started && live.started) {
      navigate("/swipe", { state: group, replace: true });
    }
  }, [live.ended, live.match, live.noMatch, live.started]);
}

/**
 * The browser's Back button (or the iPhone swipe-back gesture) would quietly leave the group,
 * so ask first, like the Leave button does. Render the returned dialog next to the screen.
 */
function useConfirmLeaveOnBack() {
  const blocker = useBlocker(({ historyAction }) => historyAction === "POP");
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Leave group?"
      confirmLabel="Leave"
      onConfirm={() => {
        closeLive();
        blocker.proceed?.();
      }}
      onCancel={() => blocker.reset?.()}
    >
      You can rejoin later with the code.
    </ConfirmDialog>
  );
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
  const isHost = session ? (live.hostId ? live.hostId === session.memberId : session.isHost) : false;
  // The host's own picks; until they touch anything, show what the server has.
  const [picked, setPicked] = useState<LobbyFilters | null>(null);
  const [error, setError] = useState("");
  const pending = useRef<{ timer: number; filters: LobbyFilters } | null>(null);

  useGroupNavigation(session, live, { started: true });
  const confirmLeave = useConfirmLeaveOnBack();

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
              sendFilters(next).catch(() => setError("Couldn't save the filters. Check your connection."));
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
        // TODO: tell the backend we left (no endpoint yet); until then a leaver still counts for matches.
        onLeave={() => {
          closeLive();
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
  const confirmLeave = useConfirmLeaveOnBack();

  useGroupNavigation(session, live, { results: true });

  // A swipe's answer can say match / no match before the live update arrives.
  useEffect(() => {
    if (!session) return;
    const group = groupOnly(session);
    if (queue.ended) {
      closeLive();
      navigate("/", { replace: true, state: { notice: "That group has ended. Start a new one, or join another." } });
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
      <Swipe
        load={load}
        initialIndex={firstUnswiped === -1 ? restaurants.length : firstUnswiped}
        notice={queueNotice(queue)}
        onRetry={fetchRestaurants}
        onChangeFilters={() => navigate("/lobby", { state: group, replace: true })}
        // Queued and sent in the background, so the next card shows right away. A swipe that
        // can't be sent (bad connection) waits and retries; the screen says so.
        onSwipe={(restaurant, liked) => swipeQueueFor(session).add(restaurant.id, liked)}
        onFinished={() => {
          const total = load.status === "ready" ? load.restaurants.length : undefined;
          navigate("/waiting", { state: { ...group, total }, replace: true });
        }}
        onLeave={() => {
          closeLive();
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
  // Per-person progress only exists in fake-data mode for now.
  const [progress, setProgress] = useState<MemberProgress[] | null>(null);
  const queue = useSwipeQueue(session);
  const confirmLeave = useConfirmLeaveOnBack();

  useGroupNavigation(session, live, { results: true });

  useEffect(() => {
    if (!session || !api.watchProgress) return;
    const me = { id: session.memberId, nickname: session.nickname };
    return api.watchProgress(me, session.isHost, session.total ?? 20, setProgress);
  }, [session?.groupId, session?.memberId]);

  // Fake-data mode: once the fake friends finish, there's no match (liking Ramen Yoshi would have matched).
  const everyoneDone = progress?.every((m) => m.swiped >= m.total) ?? false;
  useEffect(() => {
    if (!everyoneDone || !session) return;
    const timer = setTimeout(() => navigate("/no-match", { state: groupOnly(session), replace: true }), 1200);
    return () => clearTimeout(timer);
  }, [everyoneDone]);

  if (!session) return <Navigate to="/" replace />;
  const { groupId } = session;
  const { nudgeMembers, endRound } = api;

  return (
    <>
      <Waiting
        members={progress ?? live.members}
        notice={queueNotice(queue)}
        myId={session.memberId}
        isHost={live.hostId ? live.hostId === session.memberId : session.isHost}
        onNudge={nudgeMembers ? (ids) => nudgeMembers(groupId, ids) : undefined}
        onEndRound={
          endRound
            ? () => void endRound(groupId).then(() => navigate("/no-match", { state: groupOnly(session), replace: true }))
            : undefined
        }
      />
      {confirmLeave}
    </>
  );
}

/** "Start a new round" in the same group, or a new group when the server can't replay a round. */
function usePlayAgain(session: GroupSession | null) {
  const navigate = useNavigate();
  if (api.canPlayAgain) {
    return {
      label: undefined,
      go: () => {
        if (!session) return;
        swipeQueueFor(session).reset(); // new round: new swipes
        navigate("/lobby", { state: groupOnly(session), replace: true });
      },
    };
  }
  return {
    label: "Start a new group",
    go: () => {
      closeLive();
      navigate("/create", { replace: true });
    },
  };
}

function MatchRoute() {
  const session = useLocation().state as GroupSession | null;
  const live = useLive(session);
  const playAgain = usePlayAgain(session);
  const [places, setPlaces] = useState<MatchedPlace[]>(session?.places ?? []);

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
      newRoundLabel={playAgain.label}
      onNewRound={playAgain.go}
    />
  );
}

function NoMatchRoute() {
  const navigate = useNavigate();
  const session = useLocation().state as GroupSession | null;
  const live = useLive(session);
  const playAgain = usePlayAgain(session);
  // Closest picks only exist in fake-data mode for now; without them the list is hidden.
  const [load, setLoad] = useState<ClosePicksLoad | undefined>(api.getClosestPicks ? { status: "loading" } : undefined);
  const members = live.members ?? (session ? [{ id: session.memberId, nickname: session.nickname }] : []);

  const fetchPicks = useCallback(() => {
    if (!session || !api.getClosestPicks) return;
    setLoad({ status: "loading" });
    api
      .getClosestPicks(session.groupId, members.map((m) => m.id), session.memberId)
      .then((picks) => setLoad({ status: "ready", picks }))
      .catch(() => setLoad({ status: "error" }));
  }, [session?.groupId, members.length]);

  useEffect(fetchPicks, [fetchPicks]);

  if (!session) return <Navigate to="/" replace />;
  const group = groupOnly(session);
  const castVote = api.castVote;

  return (
    <NoMatch
      load={load}
      memberCount={members.length}
      onRetry={fetchPicks}
      onVote={
        castVote
          ? (restaurantId, onVotesIn) => {
              const options = load?.status === "ready" ? load.picks.map((p) => p.restaurant.id) : [];
              return castVote(session.groupId, restaurantId, options, members.length, onVotesIn);
            }
          : undefined
      }
      onVoteResult={(winner: Restaurant, result) =>
        navigate("/match", {
          state: { ...group, places: [winner], vote: { count: result.votes[winner.id] ?? 0, total: members.length } },
          replace: true,
        })
      }
      changeFiltersLabel={playAgain.label}
      onChangeFilters={playAgain.go}
      onHome={() => {
        closeLive();
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
