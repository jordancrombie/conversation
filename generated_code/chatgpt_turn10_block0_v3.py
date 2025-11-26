# Create a test packet
packet = {"type": "data", "data": "Test message"}

# Create a protocol instance
protocol = AdvancedCommunicationProtocol()

# Encrypt the packet
encrypted_packet = protocol.encrypt_packet(packet)
print(f"Encrypted packet: {encrypted_packet}")

# Decrypt the packet
decrypted_packet = protocol.decrypt_packet(encrypted_packet)
print(f"Decrypted packet: {decrypted_packet}")