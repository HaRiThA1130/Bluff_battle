import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);

const socket = io(SERVER_URL, {
  autoConnect: true,
});

function App() {
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [screen, setScreen] = useState("home");
  const [mode, setMode] = useState("create");
  const [name, setName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [selectedVote, setSelectedVote] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleConnect() {
      setConnectionStatus("connected");
      setError("");
    }

    function handleDisconnect() {
      setConnectionStatus("disconnected");
    }

    function handleRoomCreated({ code }) {
      setRoomCodeInput(code);
      setScreen("room");
    }

    function handleRoomJoined({ code }) {
      setRoomCodeInput(code);
      setScreen("room");
    }

    function handleRoomState(nextRoom) {
      setRoom(nextRoom);

      if (nextRoom.phase === "lobby") {
        setScreen("room");
      } else {
        setScreen("game");
      }

      if (nextRoom.phase !== "explanation") {
        setExplanation("");
      }

      if (nextRoom.phase !== "voting") {
        setSelectedVote("");
      }
    }

    function handleRoomLeft() {
      setRoom(null);
      setScreen("home");
      setName("");
      setRoomCodeInput("");
      setExplanation("");
      setSelectedVote("");
    }

    function handleError(payload) {
      setError(payload?.message || "Something went wrong.");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:created", handleRoomCreated);
    socket.on("room:joined", handleRoomJoined);
    socket.on("room:state", handleRoomState);
    socket.on("room:left", handleRoomLeft);
    socket.on("game:error", handleError);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:created", handleRoomCreated);
      socket.off("room:joined", handleRoomJoined);
      socket.off("room:state", handleRoomState);
      socket.off("room:left", handleRoomLeft);
      socket.off("game:error", handleError);
    };
  }, []);

  const currentPlayer = useMemo(
    () => room?.players?.find((player) => player.id === socket.id),
    [room],
  );

  const isHost = Boolean(currentPlayer?.isHost);
  const hasSubmittedExplanation = Boolean(
    currentPlayer?.hasSubmittedExplanation,
  );
  const hasVoted = Boolean(currentPlayer?.hasVoted);

  const playerById = useMemo(() => {
    const players = room?.players || [];

    return players.reduce((playersMap, player) => {
      playersMap[player.id] = player;
      return playersMap;
    }, {});
  }, [room]);

  const leaderboard = useMemo(() => {
    return [...(room?.players || [])].sort(
      (firstPlayer, secondPlayer) => secondPlayer.score - firstPlayer.score,
    );
  }, [room]);

  const connectedPlayers = room?.players?.filter(
    (player) => player.connected,
  );

  function clearError() {
    setError("");
  }

  function handleCreateRoom(event) {
    event.preventDefault();
    clearError();

    if (!name.trim()) {
      setError("Enter your name first.");
      return;
    }

    socket.emit("room:create", {
      name: name.trim(),
    });
  }

  function handleJoinRoom(event) {
    event.preventDefault();
    clearError();

    if (!name.trim()) {
      setError("Enter your name first.");
      return;
    }

    if (!roomCodeInput.trim()) {
      setError("Enter a room code.");
      return;
    }

    socket.emit("room:join", {
      name: name.trim(),
      code: roomCodeInput.trim().toUpperCase(),
    });
  }

  function handleStartGame() {
    clearError();
    socket.emit("room:start");
  }

  function handleSubmitExplanation(event) {
    event.preventDefault();
    clearError();

    if (!explanation.trim()) {
      setError("Write an explanation before submitting.");
      return;
    }

    socket.emit("game:submit-explanation", {
      explanation: explanation.trim(),
    });
  }

  function handleBeginVoting() {
    clearError();
    socket.emit("game:begin-voting");
  }

  function handleSubmitVote() {
    clearError();

    if (!selectedVote) {
      setError("Choose a player before voting.");
      return;
    }

    socket.emit("game:submit-vote", {
      playerId: selectedVote,
    });
  }

  function handleNextRound() {
    clearError();
    socket.emit("game:next-round");
  }

  function handlePlayAgain() {
    clearError();
    socket.emit("game:play-again");
  }

  function handleLeaveRoom() {
    socket.emit("room:leave");
  }

  async function handleCopyRoomCode() {
    if (!room?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      setError("Unable to copy the room code.");
    }
  }

  function renderHome() {
    return (
      <main className="app-shell home-shell">
        <section className="hero-panel">
          <div className="eyebrow">REAL-TIME SOCIAL DEDUCTION</div>
          <h1>
            BLUFF
            <span>BATTLE</span>
          </h1>
          <p className="hero-copy">
            Outsmart the room. Hide the truth. Find the bluffer.
          </p>

          <div className="game-rules">
            <div>
              <strong>2–8</strong>
              <span>PLAYERS</span>
            </div>
            <div>
              <strong>5</strong>
              <span>ROUNDS</span>
            </div>
            <div>
              <strong>1</strong>
              <span>BLUFFER</span>
            </div>
          </div>
        </section>

        <section className="card setup-card">
          <div className="tab-row">
            <button
              className={mode === "create" ? "tab active" : "tab"}
              onClick={() => {
                setMode("create");
                clearError();
              }}
              type="button"
            >
              Create room
            </button>
            <button
              className={mode === "join" ? "tab active" : "tab"}
              onClick={() => {
                setMode("join");
                clearError();
              }}
              type="button"
            >
              Join room
            </button>
          </div>

          <form
            className="setup-form"
            onSubmit={mode === "create" ? handleCreateRoom : handleJoinRoom}
          >
            <label htmlFor="player-name">Your name</label>
            <input
              id="player-name"
              maxLength={20}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
              value={name}
            />

            {mode === "join" && (
              <>
                <label htmlFor="room-code">Room code</label>
                <input
                  id="room-code"
                  maxLength={5}
                  onChange={(event) =>
                    setRoomCodeInput(
                      event.target.value.toUpperCase(),
                    )
                  }
                  placeholder="ABCDE"
                  value={roomCodeInput}
                />
              </>
            )}

            <button
              className="primary-button"
              disabled={connectionStatus !== "connected"}
              type="submit"
            >
              {connectionStatus === "connected"
                ? mode === "create"
                  ? "Create room"
                  : "Join room"
                : "Connecting..."}
            </button>
          </form>

          {error && <ErrorMessage message={error} />}
        </section>
      </main>
    );
  }

  function renderRoom() {
    return (
      <main className="app-shell room-shell">
        <header className="top-bar">
          <Logo />
          <button
            className="text-button"
            onClick={handleLeaveRoom}
            type="button"
          >
            Leave room
          </button>
        </header>

        <section className="room-layout">
          <div className="room-main">
            <div className="room-heading">
              <div>
                <div className="eyebrow">WAITING ROOM</div>
                <h2>Gather your crew</h2>
                <p>Share the code and get ready to bluff.</p>
              </div>

              <div className="room-code-box">
                <span>ROOM CODE</span>
                <strong>{room?.code}</strong>
                <button
                  className="copy-button"
                  onClick={handleCopyRoomCode}
                  type="button"
                >
                  {copied ? "Copied!" : "Copy code"}
                </button>
              </div>
            </div>

            <div className="card players-card">
              <div className="section-heading">
                <h3>Players</h3>
                <span>
                  {connectedPlayers?.length || 0} / {room?.players?.length || 8}
                </span>
              </div>

              <div className="player-list">
                {room?.players?.map((player) => (
                  <PlayerRow
                    key={player.id}
                    isCurrentPlayer={player.id === socket.id}
                    player={player}
                  />
                ))}
              </div>
            </div>

            {isHost ? (
              <button
                className="primary-button start-button"
                disabled={(connectedPlayers?.length || 0) < 2}
                onClick={handleStartGame}
                type="button"
              >
                Start game
              </button>
            ) : (
              <div className="waiting-message">
                <span className="pulse-dot" />
                Waiting for the host to start the game...
              </div>
            )}

            {error && <ErrorMessage message={error} />}
          </div>

          <aside className="card info-card">
            <div className="eyebrow">HOW TO PLAY</div>
            <Rule
              number="01"
              text="Everyone gets the same prompt and answer, except the secret bluffer."
            />
            <Rule
              number="02"
              text="Write an explanation that sounds convincing without giving the answer away."
            />
            <Rule
              number="03"
              text="Vote for the player you think is bluffing. Catch them to score big."
            />
          </aside>
        </section>
      </main>
    );
  }

  function renderGame() {
    if (!room) {
      return null;
    }

    if (room.phase === "explanation") {
      return renderExplanationPhase();
    }

    if (room.phase === "voting") {
      return renderVotingPhase();
    }

    if (room.phase === "round-results") {
      return renderRoundResults();
    }

    if (room.phase === "game-over") {
      return renderGameOver();
    }

    return null;
  }

  function renderGameHeader() {
    return (
      <header className="top-bar game-top-bar">
        <Logo />
        <div className="round-indicator">
          ROUND <strong>{room.round}</strong> / {room.totalRounds}
        </div>
        <button
          className="text-button"
          onClick={handleLeaveRoom}
          type="button"
        >
          Leave
        </button>
      </header>
    );
  }

  function renderExplanationPhase() {
    return (
      <main className="app-shell game-shell">
        {renderGameHeader()}

        <section className="phase-header">
          <div className="phase-badge">PHASE 01 · EXPLANATIONS</div>
          <h2>Make your case.</h2>
          <p>
            Explain the prompt like you know the answer. The bluffer is
            improvising.
          </p>
        </section>

        <section className="game-grid">
          <div className="game-main-column">
            <div className="card prompt-card">
              <span className="card-label">THE PROMPT</span>
              <h3>{room.prompt}</h3>

              {room.answer ? (
                <div className="answer-reveal">
                  <span>THE ANSWER</span>
                  <strong>{room.answer}</strong>
                </div>
              ) : (
                <div className="bluffer-warning">
                  <span className="secret-icon">?</span>
                  <div>
                    <strong>You are the BLUFFER</strong>
                    <p>Blend in. The answer is hidden from you.</p>
                  </div>
                </div>
              )}
            </div>

            <form
              className="card explanation-card"
              onSubmit={handleSubmitExplanation}
            >
              <div className="section-heading">
                <div>
                  <span className="card-label">YOUR EXPLANATION</span>
                  <h3>What would you say?</h3>
                </div>
                <span className="character-count">
                  {explanation.length} / 280
                </span>
              </div>

              <textarea
                disabled={hasSubmittedExplanation}
                maxLength={280}
                onChange={(event) => setExplanation(event.target.value)}
                placeholder="Write an explanation that sounds natural..."
                value={explanation}
              />

              <button
                className="primary-button"
                disabled={hasSubmittedExplanation}
                type="submit"
              >
                {hasSubmittedExplanation
                  ? "Explanation submitted"
                  : "Submit explanation"}
              </button>
            </form>

            {isHost && (
              <button
                className="secondary-button"
                disabled={
                  Object.values(room.players || {}).length < 2 ||
                  !room.players?.some(
                    (player) => player.hasSubmittedExplanation,
                  )
                }
                onClick={handleBeginVoting}
                type="button"
              >
                Open voting early
              </button>
            )}

            {error && <ErrorMessage message={error} />}
          </div>

          <aside className="card progress-card">
            <div className="section-heading">
              <h3>Ready status</h3>
              <span>
                {room.players?.filter(
                  (player) => player.hasSubmittedExplanation,
                ).length || 0}{" "}
                / {connectedPlayers?.length || 0}
              </span>
            </div>

            <div className="ready-list">
              {room.players?.map((player) => (
                <div className="ready-player" key={player.id}>
                  <span className="mini-avatar">
                    {player.name.charAt(0).toUpperCase()}
                  </span>
                  <span>{player.name}</span>
                  <span
                    className={
                      player.hasSubmittedExplanation
                        ? "ready-state complete"
                        : "ready-state"
                    }
                  >
                    {player.hasSubmittedExplanation ? "READY" : "WRITING"}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>
    );
  }

  function renderVotingPhase() {
    return (
      <main className="app-shell game-shell">
        {renderGameHeader()}

        <section className="phase-header">
          <div className="phase-badge voting-badge">
            PHASE 02 · VOTING
          </div>
          <h2>Find the bluffer.</h2>
          <p>Read the explanations carefully. Trust nobody.</p>
        </section>

        <section className="voting-layout">
          <div className="card explanations-board">
            <div className="section-heading">
              <div>
                <span className="card-label">THE EVIDENCE</span>
                <h3>Who is bluffing?</h3>
              </div>
              <span className="vote-count">
                {room.players?.filter((player) => player.hasVoted).length || 0}{" "}
                / {connectedPlayers?.length || 0} voted
              </span>
            </div>

            <div className="explanation-list">
              {room.players?.map((player, index) => (
                <article
                  className={
                    selectedVote === player.id
                      ? "explanation-item selected"
                      : "explanation-item"
                  }
                  key={player.id}
                >
                  <div className="explanation-meta">
                    <span className="explanation-number">
                      0{index + 1}
                    </span>
                    <strong>{player.name}</strong>
                    {player.id === socket.id && (
                      <span className="you-tag">YOU</span>
                    )}
                  </div>

                  <p>
                    {room.explanations?.[player.id] ||
                      "Explanation submitted. Details are hidden until results."}
                  </p>

                  {player.id !== socket.id && player.connected && (
                    <button
                      className="vote-button"
                      disabled={hasVoted}
                      onClick={() => setSelectedVote(player.id)}
                      type="button"
                    >
                      {selectedVote === player.id
                        ? "Selected"
                        : "Vote for this player"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </div>

          <aside className="card vote-card">
            <span className="card-label">YOUR VOTE</span>
            <h3>
              {selectedVote
                ? playerById[selectedVote]?.name
                : "Select a player"}
            </h3>
            <p>
              Your vote is final. Choose the player whose explanation feels
              suspicious.
            </p>
            <button
              className="primary-button"
              disabled={hasVoted || !selectedVote}
              onClick={handleSubmitVote}
              type="button"
            >
              {hasVoted ? "Vote submitted" : "Lock in vote"}
            </button>
          </aside>
        </section>

        {error && <ErrorMessage message={error} />}
      </main>
    );
  }

  function renderRoundResults() {
    const bluffer = playerById[room.blufferId];
    const roundWinner = playerById[room.roundWinnerId];

    return (
      <main className="app-shell results-shell">
        {renderGameHeader()}

        <section className="results-hero">
          <div className="phase-badge results-badge">ROUND RESULTS</div>
          <h2>{bluffer?.name || "The bluffer"} was the bluffer!</h2>
          <p>
            {roundWinner
              ? `${roundWinner.name} made the strongest play this round.`
              : "The room could not agree on a suspect."}
          </p>
        </section>

        <section className="results-grid">
          <div className="card reveal-card">
            <span className="card-label">THE ANSWER</span>
            <h3>{room.answer}</h3>

            <div className="bluffer-reveal">
              <span className="mini-avatar bluffer-avatar">
                {bluffer?.name?.charAt(0).toUpperCase() || "?"}
              </span>
              <div>
                <span>THE BLUFFER WAS</span>
                <strong>{bluffer?.name || "Unknown"}</strong>
              </div>
            </div>

            <div className="vote-results">
              <span className="card-label">HOW THE ROOM VOTED</span>
              {room.players?.map((player) => (
                <div className="vote-result-row" key={player.id}>
                  <span>{player.name}</span>
                  <strong>
                    {playerById[room.votes?.[player.id]]?.name ||
                      "No vote"}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          <div className="card scoreboard-card">
            <div className="section-heading">
              <div>
                <span className="card-label">SCOREBOARD</span>
                <h3>Round {room.round}</h3>
              </div>
            </div>

            <Scoreboard
              players={leaderboard}
              roundScores={room.roundScores}
            />
          </div>
        </section>

        {isHost ? (
          <button
            className="primary-button next-round-button"
            onClick={handleNextRound}
            type="button"
          >
            Start next round
          </button>
        ) : (
          <div className="waiting-message">
            <span className="pulse-dot" />
            Waiting for the host to continue...
          </div>
        )}

        {error && <ErrorMessage message={error} />}
      </main>
    );
  }

  function renderGameOver() {
    const winner = playerById[room.winnerId];

    return (
      <main className="app-shell results-shell game-over-shell">
        <header className="top-bar">
          <Logo />
          <button
            className="text-button"
            onClick={handleLeaveRoom}
            type="button"
          >
            Leave room
          </button>
        </header>

        <section className="winner-hero">
          <div className="trophy-icon">✦</div>
          <div className="phase-badge results-badge">GAME COMPLETE</div>
          <h1>
            {winner?.name || "The winner"}<span> WINS!</span>
          </h1>
          <p>Five rounds. One champion. An unforgettable bluff battle.</p>
        </section>

        <section className="card final-scoreboard">
          <div className="section-heading">
            <div>
              <span className="card-label">FINAL STANDINGS</span>
              <h2>The leaderboard</h2>
            </div>
          </div>

          <Scoreboard
            isFinal
            players={leaderboard}
            roundScores={room.roundScores}
          />
        </section>

        {isHost ? (
          <button
            className="primary-button next-round-button"
            onClick={handlePlayAgain}
            type="button"
          >
            Play again
          </button>
        ) : (
          <div className="waiting-message">
            <span className="pulse-dot" />
            Waiting for the host to start another game...
          </div>
        )}

        {error && <ErrorMessage message={error} />}
      </main>
    );
  }

  if (screen === "home") {
    return renderHome();
  }

  if (screen === "room") {
    return renderRoom();
  }

  return renderGame();
}

function Logo() {
  return (
    <div className="brand-mark">
      <span className="brand-symbol">✦</span>
      <span>
        BLUFF <strong>BATTLE</strong>
      </span>
    </div>
  );
}

function PlayerRow({ player, isCurrentPlayer }) {
  return (
    <div className={player.connected ? "player-row" : "player-row offline"}>
      <span className="player-avatar">
        {player.name.charAt(0).toUpperCase()}
      </span>
      <span className="player-name">
        {player.name}
        {isCurrentPlayer && <small>YOU</small>}
      </span>
      {player.isHost && <span className="host-badge">HOST</span>}
      {!player.connected && <span className="offline-label">OFFLINE</span>}
    </div>
  );
}

function Rule({ number, text }) {
  return (
    <div className="rule-item">
      <span>{number}</span>
      <p>{text}</p>
    </div>
  );
}

function Scoreboard({ players, roundScores, isFinal = false }) {
  return (
    <div className="scoreboard-list">
      {players.map((player, index) => (
        <div
          className={
            index === 0 && isFinal
              ? "score-row winner-row"
              : "score-row"
          }
          key={player.id}
        >
          <span className="rank-number">
            {index === 0 && isFinal ? "✦" : `0${index + 1}`}
          </span>
          <span className="score-avatar">
            {player.name.charAt(0).toUpperCase()}
          </span>
          <span className="score-player-name">
            {player.name}
            {player.isHost && <small>HOST</small>}
          </span>
          {!isFinal && (
            <span className="round-score">
              +{roundScores?.[player.id] || 0}
            </span>
          )}
          <strong className="total-score">{player.score}</strong>
        </div>
      ))}
    </div>
  );
}

function ErrorMessage({ message }) {
  return (
    <div className="error-message" role="alert">
      <span>!</span>
      {message}
    </div>
  );
}

export default App;