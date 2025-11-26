from cryptography.fernet import Fernet

# ... existing code ...

class AdvancedCommunicationProtocol:
    # ... existing code ...

    def __init__(self, encryption_key=None, protocol_version="1.0"):
        # ... existing code ...
        # Create Fernet object for encryption and decryption
        self.cipher_suite = Fernet(self.encryption_key)

    def encrypt_data(self, data: dict) -> str:
        """
        Encrypts the data using the encryption key and returns the encrypted data.
        """
        # Convert dict to bytes
        data_bytes = str(data).encode('utf-8')
        
        # Encrypt data
        encrypted_data = self.cipher_suite.encrypt(data_bytes)
        
        return encrypted_data

    def decrypt_data(self, encrypted_data: str) -> dict:
        """
        Decrypts the encrypted data using the encryption key and returns the original data.
        """
        # Decrypt data
        decrypted_data = self.cipher_suite.decrypt(encrypted_data)
        
        # Convert bytes to dict
        data = eval(decrypted_data.decode('utf-8'))
        
        return data