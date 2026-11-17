import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router";
import {
  createGroup,
  endRound,
  joinGroup,
  mockGroup,
  nudgeMembers,
  watchMembers,
  watchProgress,
  type Member,
  type MemberProgress,
} from "./api/groups";
import { Home } from "./screens/Home/Home";
import { JoinGroup } from "./screens/JoinGroup/JoinGroup";
import { DEFAULT_FILTERS, Lobby, type LobbyFilters } from "./screens/Lobby/Lobby";
import { Swipe, type SwipeLoadState } from "./screens/Swipe/Swipe";
import { Waiting } from "./screens/Waiting/Waiting";
import { Match, type MatchedPlace } from "./screens/Match/Match";
import { NoMatch, type ClosePicksLoad } from "./screens/NoMatch/NoMatch";
import { castVote, getClosestPicks, getRestaurants, sendSwipe } from "./api/restaurants";
import { shareInvite } from "./utils/shareInvite";

// Mock location until the location flow is built (see Figma notes for 1. Home).
const MOCK_LOCATION = "Berkeley, CA";

// Remember the nickname on this device so returning users don't retype it.
const NICKNAME_KEY = "crave.nickname";
function loadNickname() {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveNickname(name: string) {
  try {
    localStorage.setItem(NICKNAME_KEY, name);
  } catch {
    // Private mode or storage blocked: not important.
  }
}

/** Who you are in the group you're in. Passed to /lobby and /swipe as router state (survives a page refresh). */
type GroupSession = {
  groupId: string;
  memberId: string;
  code: string;
  nickname: string;
  isHost: boolean;
  /** How many cards this round has (set when swiping starts). */
  total?: number;
  /** The matched place(s), for /match. */
  places?: MatchedPlace[];
  /** Set when the place won a quick vote. */
  vote?: { count: number; total: number };
};

/** Go back if we came from inside the app, otherwise go to Home (e.g. someone opened /join directly). */
function useGoBack() {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/", { replace: true });
  };
}

function HomeRoute() {
  const navigate = useNavigate();
  const creating = useRef(false);
  return (
    <Home
      locationLabel={MOCK_LOCATION}
      onCreateGroup={async () => {
        if (creating.current) return; // ignore double taps
        creating.current = true;
        try {
          // TODO: Home has no name field yet, so the host uses their saved name (or "You").
          const nickname = loadNickname() || "You";
          const group = await createGroup(nickname);
          const session: GroupSession = {
            groupId: group.groupId,
            memberId: group.memberId,
            code: group.joinCode,
            nickname,
            isHost: true,
          };
          navigate("/lobby", { state: session });
        } finally {
          creating.current = false;
        }
      }}
      onJoinWithCode={() => navigate("/join")}
      // TODO: location picker screen.
      onChangeLocation={() => console.info("Change location")}
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
      onJoin={joinGroup}
      onJoined={(result, nickname, code) => {
        saveNickname(nickname);
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
  const [members, setMembers] = useState<Member[] | null>(null);
  const [filters, setFilters] = useState<LobbyFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    if (!session) return;
    // TODO: replace the mock with the Socket.io `state` / `member_joined` events.
    return watchMembers({ id: session.memberId, nickname: session.nickname }, session.isHost, setMembers);
  }, [session?.groupId, session?.memberId]);

  // Opened /lobby directly (no group): nothing to show.
  if (!session) return <Navigate to="/" replace />;

  return (
    <Lobby
      code={session.code}
      members={members}
      myId={session.memberId}
      isHost={session.isHost}
      filters={filters}
      // TODO: send filter changes to the backend (no endpoint for this yet).
      onFiltersChange={setFilters}
      onShareInvite={() => shareInvite(session.code)}
      // TODO: send the filters with "start", and move guests along when the host starts (needs a socket event).
      onStart={() => navigate("/swipe", { state: session, replace: true })}
      // TODO: tell the backend we left (no endpoint for this yet).
      onLeave={() => navigate("/", { replace: true })}
    />
  );
}

function SwipeRoute() {
  const navigate = useNavigate();
  const session = useLocation().state as GroupSession | null;
  const [load, setLoad] = useState<SwipeLoadState>({ status: "loading" });

  const fetchRestaurants = useCallback(() => {
    if (!session) return;
    setLoad({ status: "loading" });
    getRestaurants(session.groupId)
      .then((restaurants) => setLoad({ status: "ready", restaurants }))
      .catch(() => setLoad({ status: "error" }));
  }, [session?.groupId]);

  useEffect(fetchRestaurants, [fetchRestaurants]);

  if (!session) return <Navigate to="/" replace />;

  return (
    <Swipe
      load={load}
      onRetry={fetchRestaurants}
      onChangeFilters={() => navigate("/lobby", { state: session, replace: true })}
      onSwipe={(restaurant, liked) => {
        // Sent in the background so the next card shows right away.
        sendSwipe(session.groupId, restaurant.id, liked)
          .then((result) => {
            // You were the last one to finish and nobody matched.
            if (result.noMatch) return navigate("/no-match", { state: session, replace: true });
            if (!result.match) return;
            // Use the full card (photo, price…) when we have it; match_found only sends the basics.
            const restaurants = load.status === "ready" ? load.restaurants : [];
            const place = restaurants.find((r) => r.id === result.match?.restaurantId) ?? restaurant;
            navigate("/match", { state: { ...session, places: [place] }, replace: true });
          })
          .catch((error) => console.warn("Swipe not sent", error));
      }}
      onFinished={() => {
        const total = load.status === "ready" ? load.restaurants.length : undefined;
        navigate("/waiting", { state: { ...session, total }, replace: true });
      }}
      onLeave={() => navigate("/", { replace: true })}
    />
  );
}

function WaitingRoute() {
  const session = useLocation().state as GroupSession | null;
  const [members, setMembers] = useState<MemberProgress[] | null>(null);

  useEffect(() => {
    if (!session) return;
    // TODO: replace the mock with a live "progress" event from the backend.
    const me = { id: session.memberId, nickname: session.nickname };
    return watchProgress(me, session.isHost, session.total ?? 20, setMembers);
  }, [session?.groupId, session?.memberId]);

  const navigate = useNavigate();
  const everyoneDone = members?.every((m) => m.swiped >= m.total) ?? false;
  useEffect(() => {
    if (!everyoneDone || !session) return;
    // TODO: listen for no_match / match_found instead. In the mock, finishing here means no match
    // (liking Ramen Yoshi would have matched already). Short pause so "Everyone's done!" shows.
    const timer = setTimeout(() => navigate("/no-match", { state: session, replace: true }), 1200);
    return () => clearTimeout(timer);
  }, [everyoneDone]);

  if (!session) return <Navigate to="/" replace />;

  return (
    <Waiting
      members={members}
      myId={session.memberId}
      isHost={session.isHost}
      onNudge={(ids) => nudgeMembers(session.groupId, ids)}
      // Ending early means there was no match yet, so show the closest picks.
      onEndRound={() => void endRound(session.groupId).then(() => navigate("/no-match", { state: session, replace: true }))}
    />
  );
}

function MatchRoute() {
  const navigate = useNavigate();
  const session = useLocation().state as GroupSession | null;
  if (!session?.places?.length) return <Navigate to="/" replace />;

  // TODO: use the real member list from the socket `state` event.
  const members = mockGroup({ id: session.memberId, nickname: session.nickname }, session.isHost);
  // Back to the Lobby with the same group, minus this round's details.
  const { places, total: _total, vote: _vote, ...group } = session;

  return (
    <Match
      places={places}
      members={members}
      vote={session.vote}
      // TODO: tell the backend a new round started (there's no endpoint for this yet).
      onNewRound={() => navigate("/lobby", { state: group, replace: true })}
    />
  );
}

function NoMatchRoute() {
  const navigate = useNavigate();
  const session = useLocation().state as GroupSession | null;
  const [load, setLoad] = useState<ClosePicksLoad>({ status: "loading" });
  // TODO: use the real member list from the socket `state` event.
  const members = session ? mockGroup({ id: session.memberId, nickname: session.nickname }, session.isHost) : [];

  const fetchPicks = useCallback(() => {
    if (!session) return;
    setLoad({ status: "loading" });
    getClosestPicks(session.groupId, members.map((m) => m.id), session.memberId)
      .then((picks) => setLoad({ status: "ready", picks }))
      .catch(() => setLoad({ status: "error" }));
  }, [session?.groupId]);

  useEffect(fetchPicks, [fetchPicks]);

  if (!session) return <Navigate to="/" replace />;
  const { places: _places, total: _total, vote: _vote, ...group } = session;

  return (
    <NoMatch
      load={load}
      memberCount={members.length}
      onRetry={fetchPicks}
      onVote={(restaurantId, onVotesIn) => {
        const options = load.status === "ready" ? load.picks.map((p) => p.restaurant.id) : [];
        // TODO: real vote endpoint + live "votes in" / result events.
        return castVote(session.groupId, restaurantId, options, members.length, onVotesIn);
      }}
      onVoteResult={(winner, result) =>
        navigate("/match", {
          state: { ...group, places: [winner], vote: { count: result.votes[winner.id] ?? 0, total: members.length } },
          replace: true,
        })
      }
      // TODO: the backend can't restart a group's stack yet ("widen filters" = new group for now).
      onChangeFilters={() => navigate("/lobby", { state: group, replace: true })}
      onHome={() => navigate("/", { replace: true })}
    />
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/join" element={<JoinRoute />} />
        <Route path="/lobby" element={<LobbyRoute />} />
        <Route path="/swipe" element={<SwipeRoute />} />
        <Route path="/waiting" element={<WaitingRoute />} />
        <Route path="/match" element={<MatchRoute />} />
        <Route path="/no-match" element={<NoMatchRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
