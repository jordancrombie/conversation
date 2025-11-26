import hashlib
import json
import queue
from collections import defaultdict
import uuid

class AdvancedCommunicationProtocol:
    MAX_RETRIES = 3  # Define a constant for maximum retries
    BUFFER_SIZE = 100  # Maximum number of packets to buffer before processing

    def __init__(self):
        self.sequence_number = 0
        self.received_packets = defaultdict(dict)  # Buffer for out-of-order packets
        self.expected_sequence_number = 0  # Track the next expected sequence number
        self.active_sessions = {}  # Dictionary to track active sessions by session ID
        self.current_session_id = None  # Current session ID for the sender

    def compute_hash(self, packet: dict) -> str:
        """
        Computes a hash of the packet content (excluding the hash field if it exists).
        """
        packet_copy = packet.copy()
        packet_copy.pop('hash', None)  # Exclude the hash field from the computation
        packet_str = json.dumps(packet_copy, sort_keys=True)
        return hashlib.sha256(packet_str.encode()).hexdigest()

    def start_session(self, destination: str) -> str:
        """
        Starts a new communication session with the destination.
        Returns the session ID for tracking purposes.
        """
        if self.current_session_id is not None:
            raise ValueError("A session is already active. End the current session before starting a new one.")

        # Generate a unique session ID
        session_id = str(uuid.uuid4())
        self.current_session_id = session_id
        self.sequence_number = 0  # Reset sequence number for the new session
        self.active_sessions[session_id] = {'destination': destination, 'state': 'starting'}

        # Create a session-start packet
        packet = {
            'type': 'session-start',
            'session_id': session_id
        }

        # Send the packet and wait for an ACK
        self.send_packet(packet, destination)
        self.active_sessions[session_id]['state'] = 'active'
        print(f"Session {session_id} started with {destination}")
        return session_id

    def end_session(self, destination: str):
        """
        Ends the current communication session with the destination.
        """
        if self.current_session_id is None:
            raise ValueError("No active session to end.")

        session_id = self.current_session_id
        if session_id not in self.active_sessions or self.active_sessions[session_id]['destination'] != destination:
            raise ValueError("Session mismatch or invalid destination.")

        # Create a session-end packet
        packet = {
            'type': 'session-end',
            'session_id': session_id
        }

        # Send the packet and wait for an ACK
        self.send_packet(packet, destination)
        self.active_sessions[session_id]['state'] = 'ended'
        self.current_session_id = None
        del self.active_sessions[session_id]
        print(f"Session {session_id} ended with {destination}")

    def send_packet(self, packet: dict, destination: str, retries=0):
        """
        Sends a packet to a destination, retrying up to MAX_RETRIES times if an error occurs.
        """
        # Add session ID to data packets if a session is active
        if packet['type'] == 'data':
            if self.current_session_id is None:
                raise ValueError("Cannot send data packet without an active session.")
            packet['session_id'] = self.current_session_id
            packet['sequence_number'] = self.sequence_number
            self.sequence_number += 1

        # Compute the hash of the packet and include it in the packet
        packet['hash'] = self.compute_hash(packet)

        # Placeholder for actual sending logic
        print(f"Sending packet to {destination}: {packet}")

        # If it's a data or session packet, wait for an ACK or NACK
        if packet['type'] in ['data', 'session-start', 'session-end']:
            response = self.receive_packet()  # This will need to be implemented

            if response['type'] == 'nack':
                # If we received a NACK, resend the packet
                if retries < self.MAX_RETRIES:
                    self.send_packet(packet, destination, retries + 1)
                else:
                    raise ValueError("Maximum number of retries exceeded")

    def receive_packet(self) -> dict:
        """
        Placeholder for receiving a packet. In a real implementation, this would
        interact with the network layer to retrieve incoming packets.
        For now, we'll return a dummy response.
        """
        # Simulate receiving a response (ACK/NACK)
        return {'type': 'ack'}  # Dummy response for now

    def handle_received_packet(self, packet: dict):
        """
        Handles a received packet, validating its integrity and managing session and sequence numbers.
        """
        # Verify the packet's hash
        received_hash = packet.get('hash')
        computed_hash = self.compute_hash(packet)
        if received_hash != computed_hash:
            print("Packet integrity check failed. Discarding packet.")
            return None

        session_id = packet.get('session_id')
        packet_type = packet['type']

        if packet_type == 'session-start':
            if session_id in self.active_sessions:
                print(f"Session {session_id} already exists. Ignoring session-start.")
                return None
            self.active_sessions[session_id] = {'state': 'active'}
            self.expected_sequence_number = 0  # Reset for new session
            print(f"New session {session_id} started.")
            return packet

        elif packet_type == 'session-end':
            if session_id not in self.active_sessions:
                print(f"Session {session_id} does not exist. Ignoring session-end.")
                return None
            self.active_sessions[session_id]['state'] = 'ended'
            del self.active_sessions[session_id]
            print(f"Session {session_id} ended.")
            return packet

        elif packet_type == 'data':
            if session_id not in self.active_sessions:
                print(f"Data packet received for unknown session {session_id}. Discarding.")
                return None

            seq_num = packet.get('sequence_number', -1)
            if seq_num < 0:
                print("Invalid sequence number in packet. Discarding.")
                return None

            # Store the packet in the buffer
            self.received_packets[seq_num] = packet
            print(f"Buffered packet with sequence number {seq_num} for session {session_id}")
            return self.process_buffered_packets()

        return packet

    def process_buffered_packets(self):
        """
        Processes buffered packets in order of sequence numbers.
        Returns a list of packets that are ready to be processed.
        """
        processed_packets = []
        while self.expected_sequence_number in self.received_packets:
            packet = self.received_packets.pop(self.expected_sequence_number)
            processed_packets.append(packet)
            print(f"Processing packet with sequence number {self.expected_sequence_number}")
            self.expected_sequence_number += 1

        # Check for missing packets and request retransmission if needed
        if self.received_packets:
            missing_seq_nums = [seq for seq in range(self.expected_sequence_number, min(self.received_packets.keys()))]
            if missing_seq_nums:
                print(f"Missing packets with sequence numbers: {missing_seq_nums}")
                self.request_retransmission(missing_seq_nums)

        return processed_packets

    def request_retransmission(self, missing_seq_nums: list):
        """
        Requests retransmission of missing packets by sending a NACK with the missing sequence numbers.
        """
        nack_packet = {
            'type': 'nack',
            'missing_sequence_numbers': missing_seq_nums,
            'session_id': self.current_session_id if self.current_session_id else None
        }
        print(f"Requesting retransmission for sequence numbers: {missing_seq_nums}")
        # In a real implementation, send this NACK packet to the sender