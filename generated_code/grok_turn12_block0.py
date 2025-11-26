import time

class AdvancedCommunicationProtocol:
    SESSION_TIMEOUT = 300  # Timeout in seconds (5 minutes)

    def __init__(self):
        self.sequence_number = 0
        self.received_packets = defaultdict(dict)
        self.expected_sequence_number = 0
        self.active_sessions = {}  # Now includes 'last_activity' timestamp
        self.current_session_id = None

    def start_session(self, destination: str) -> str:
        if self.current_session_id is not None:
            raise ValueError("A session is already active. End the current session before starting a new one.")
        session_id = str(uuid.uuid4())
        self.current_session_id = session_id
        self.sequence_number = 0
        self.active_sessions[session_id] = {
            'destination': destination,
            'state': 'starting',
            'last_activity': time.time()
        }
        packet = {'type': 'session-start', 'session_id': session_id}
        self.send_packet(packet, destination)
        self.active_sessions[session_id]['state'] = 'active'
        self.active_sessions[session_id]['last_activity'] = time.time()
        print(f"Session {session_id} started with {destination}")
        return session_id

    def cleanup_inactive_sessions(self):
        """
        Removes sessions that have been inactive for longer than SESSION_TIMEOUT.
        """
        current_time = time.time()
        inactive_sessions = [
            sid for sid, info in self.active_sessions.items()
            if current_time - info['last_activity'] > self.SESSION_TIMEOUT
        ]
        for sid in inactive_sessions:
            print(f"Session {sid} timed out due to inactivity.")
            del self.active_sessions[sid]
            if self.current_session_id == sid:
                self.current_session_id = None

    def handle_received_packet(self, packet: dict):
        session_id = packet.get('session_id')
        if session_id in self.active_sessions:
            self.active_sessions[session_id]['last_activity'] = time.time()
        # Rest of the method remains the same...