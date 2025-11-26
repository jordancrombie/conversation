import hashlib
import json

class AdvancedCommunicationProtocol:
    # ... existing code ...

    def compute_hash(self, packet: dict) -> str:
        """
        Computes a SHA-256 hash of the packet.
        """
        # Convert the packet to a string and then bytes
        packet_bytes = json.dumps(packet).encode('utf-8')

        # Compute the hash
        packet_hash = hashlib.sha256(packet_bytes).hexdigest()

        return packet_hash

    def send_packet(self, packet: dict, destination: str, retries=0):
        """
        Sends a packet to a destination, retrying up to MAX_RETRIES times if an error occurs.
        """
        # Compute the hash of the packet and include it in the packet
        packet['hash'] = self.compute_hash(packet)

        # ... existing code ...

    def receive_packet(self, packet: dict, retries=0) -> dict:
        """
        Receives a packet and performs basic validation, retrying up to MAX_RETRIES times if an error occurs.
        """
        # ... existing code ...

        # Compute the hash of the received packet (without the hash field)
        received_hash = packet.pop('hash', None)
        computed_hash = self.compute_hash(packet)

        # If the hashes don't match, raise an error
        if received_hash != computed_hash:
            raise ValueError(f"Packet hash does not match computed hash: {received_hash} != {computed_hash}")

        # ... existing code ...