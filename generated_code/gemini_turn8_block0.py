from cryptography.fernet import Fernet
import json

class AdvancedCommunicationProtocol:
    # ... existing code ...

    def __init__(self):
        # ... existing code ...
        # Create a key for symmetric encryption
        self.key = Fernet.generate_key()
        self.cipher_suite = Fernet(self.key)

    def encrypt_packet(self, packet: dict) -> bytes:
        """
        Encrypts a packet using symmetric encryption.
        """
        # Convert the packet to a string and then bytes
        packet_bytes = str(packet).encode('utf-8')

        # Encrypt the packet
        encrypted_packet = self.cipher_suite.encrypt(packet_bytes)

        return encrypted_packet

    def decrypt_packet(self, encrypted_packet: bytes) -> dict:
        """
        Decrypts an encrypted packet.
        """
        # Decrypt the packet
        decrypted_packet_bytes = self.cipher_suite.decrypt(encrypted_packet)

        # Convert the bytes back to a string, then to a dict
        decrypted_packet_str = decrypted_packet_bytes.decode('utf-8')
        decrypted_packet = json.loads(decrypted_packet_str)

        return decrypted_packet