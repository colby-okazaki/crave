import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router";
import { createGroup, joinGroup, watchMembers, type Member } from "./api/groups";
import { Home } from "./screens/Home/Home";
import { JoinGroup } from "./screens/JoinGroup/JoinGroup";
import { DEFAULT_FILTERS, Lobby, type LobbyFilters } from "./screens/Lobby/Lobby";
import { Swipe, type SwipeLoadState } from "./screens/Swipe/Swipe";
import { getRestaurants, sendSwipe } from "./api/restaurants";
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
            // TODO: open the Match screen.
            if (result.match) console.info("Match!", result.match);
          })
          .catch((error) => console.warn("Swipe not sent", error));
      }}
      // TODO: Waiting screen (Figma 7. Waiting).
      onFinished={() => console.info("Finished swiping")}
      onLeave={() => navigate("/", { replace: true })}
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
