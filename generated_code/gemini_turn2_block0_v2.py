import time
import uuid
from enum import Enum
from cryptography.fernet import Fernet
import json
import hashlib

class ErrorCode(Enum):
    CONNECTION_REFUSED = 100
    TIMEOUT = 101
    INVALID_DATA = 102
    PROTOCOL_VERSION_MISMATCH = 103
    UNKNOWN_ERROR = 104
    UNAUTHORIZED_ACCESS = 105  # New error code for intrusion

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
        # ... existing code ...
        # Create Fernet object for encryption and decryption
        self.encryption_key = encryption_key
        if not self.encryption_key:
            raise ValueError("Encryption key must be provided.")
        self.cipher_suite = Fernet(self.encryption_key)

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
        Sends a packet to a destination.
        """
        # Encrypt the data in the packet before sending
        packet['data'] = self.encrypt_data(packet['data'])

        print(f"Sending packet to {destination}: {packet}")
        # Simulate potential errors
        if packet["data"].get("invalid_field") == "true":
            packet["error_code"] = ErrorCode.INVALID_DATA.value
        elif packet["timestamp"] > time.time() - 5: #Simulate timeout
            packet["error_code"] = ErrorCode.TIMEOUT.value
        # Check for potential intrusion
        elif self.detect_intrusion(packet):
            packet["error_code"] = ErrorCode.UNAUTHORIZED_ACCESS.value
            print("Intrusion detected!  Logging attempt...") #Logging
        print(f"Packet received with error code: {packet.get('error_code')}")

    def receive_packet(self, packet: dict) -> dict:
        """
        Receives a packet and performs basic validation.
        """
        if packet.get("error_code"):
            print(f"Error received: {self.error_codes.get(packet['error_code'], 'Unknown Error')}")
            return packet  # Return the packet with the error
        else:
            # Decrypt the data in the packet upon receiving
            packet['data'] = self.decrypt_data(packet['data'])

        print(f"Received packet: {packet}")
        return packet

    def detect_intrusion(self, packet: dict) -> bool:
        """
        Detects potential intrusion based on the packet data.
        """
        try:
            # Try to decrypt the data. If it fails, it might indicate an intrusion
            decrypted_data = self.decrypt_data(packet['data'])
            return decrypted_data is None
        except Exception as e:
            print(f"Error occurred during intrusion detection: {str(e)}")
            return True  # Assume an intrusion if an error occurs