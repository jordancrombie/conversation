class AdvancedCommunicationProtocol:
    # ... existing code ...

    def encrypt_data(self, data: dict) -> str:
        """
        Encrypts the data using the encryption key and returns the encrypted data.
        """
        try:
            # Convert dict to bytes
            data_bytes = str(data).encode('utf-8')
            
            # Encrypt data
            encrypted_data = self.cipher_suite.encrypt(data_bytes)
            
            return encrypted_data
        except Exception as e:
            print(f"Error occurred during encryption: {str(e)}")
            return None

    def decrypt_data(self, encrypted_data: str) -> dict:
        """
        Decrypts the encrypted data using the encryption key and returns the original data.
        """
        try:
            # Decrypt data
            decrypted_data = self.cipher_suite.decrypt(encrypted_data)
            
            # Convert bytes to dict
            data = eval(decrypted_data.decode('utf-8'))
            
            return data
        except Exception as e:
            print(f"Error occurred during decryption: {str(e)}")
            return None