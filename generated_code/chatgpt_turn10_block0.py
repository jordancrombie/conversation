import time
import uuid
from enum import Enum

class ErrorCode(Enum):
    CONNECTION_REFUSED = 100
    TIMEOUT = 101
    INVALID_DATA = 102
    PROTOCOL_VERSION_MISMATCH = 103
    UNKNOWN_ERROR = 104

class AdvancedCommunicationProtocol:
    """
    Advanced communication protocol with:
    - Packet structure refinement
    - Improved error handling
    - Protocol versioning
    - Advanced encryption (placeholder)
    - Intrusion Detection System (IDS) (placeholder)
    """

    def __init__(self, encryption_key: str = None, protocol_version: str = "1.0"):
        self.encryption_key = encryption_key
        self.protocol_version = protocol_version
        self.error_codes = {
            ErrorCode.CONNECTION_REFUSED.value: "Connection Refused",
            ErrorCode.TIMEOUT.value: "Timeout",
            ErrorCode.INVALID_DATA.value: "Invalid Data",
            ErrorCode.PROTOCOL_VERSION_MISMATCH.value: "Protocol Version Mismatch",
            ErrorCode.UNKNOWN_ERROR.value: "Unknown Error"
        }
        self.packet_id_counter = 1  # Simple ID generation

    def create_packet(self, data: dict) -> dict:
        """
        Creates a new packet with timestamp, packet ID, and data.
        """
        packet_id = self.packet_id_counter
        self.packet_id_counter += 1
        timestamp = int(time.time())
        packet = {
            "packet_id": packet_id,
            "timestamp": timestamp,
            "protocol_version": self.protocol_version,
            "data": data,
            "error_code": None  # Initially no error
        }
        return packet

    def send_packet(self, packet: dict, destination: str):
        """
        Simulates sending a packet to a destination.  In a real system, this would involve network communication.
        """
        print(f"Sending packet to {destination}: {packet}")
        # Simulate potential errors
        if packet["data"].get("invalid_field") == "true":
            packet["error_code"] = ErrorCode.INVALID_DATA.value
        elif packet["timestamp"] > time.time() - 5: #Simulate timeout
            packet["error_code"] = ErrorCode.TIMEOUT.value
        print(f"Packet received with error code: {packet.get('error_code')}")

    def receive_packet(self, packet: dict) -> dict:
        """
        Simulates receiving a packet and performing basic validation.
        """
        if packet.get("error_code"):
            print(f"Error received: {self.error_codes.get(packet['error_code'], 'Unknown Error')}")
            return packet  # Return the packet with the error

        print(f"Received packet: {packet}")
        return packet

    def handle_error(self, error_code: ErrorCode):
        """
        Handles an error and returns an error message.
        """
        return self.error_codes.get(error_code.value, "Unknown Error")