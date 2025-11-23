# Internet Exposure Detection for Apantli

**Date**: 2025-11-23
**Focus**: Technical implementation of network security monitoring

## The Security Problem

### Silent Exposure

**Scenario**: User starts Apantli on their laptop:
```bash
apantli
```

**What they see**:
```
🚀 Apantli server starting...
   Server at http://localhost:4000/ or http://192.168.1.100:4000/
```

**What they might not realize**:
- `192.168.1.100:4000` is accessible to everyone on their WiFi network
- Their firewall might not be blocking port 4000
- They're on public WiFi at a coffee shop
- Someone could be accessing their server RIGHT NOW

**The Risk**:
```
Laptop on public WiFi (coffee shop)
├── IP: 192.168.43.55 (local)
├── Public IP: 203.0.113.45 (coffee shop's router)
├── Port 4000: OPEN
└── Apantli running: UNPROTECTED

Anyone on the coffee shop WiFi can:
✅ Access http://192.168.43.55:4000
✅ See all your conversations
✅ Make requests using YOUR API keys
✅ View all your prompts and responses
```

### Why Users Don't Notice

1. **Output looks safe**: "localhost" is prominent, IP is secondary
2. **No visual warning**: Just shows URLs, no security context
3. **Works locally**: Everything functions, no errors
4. **Default behavior**: Binds to `0.0.0.0` (all interfaces)
5. **Firewall confusion**: macOS/Linux firewalls don't always block Python

## Detection Strategy: Multi-Layer Approach

### Layer 1: Network Interface Analysis

**Goal**: Determine which network interfaces are bound

**Implementation**:
```python
import netifaces
import ipaddress
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class NetworkInterface:
    name: str              # 'en0', 'wlan0', 'eth0'
    ip: str                # '192.168.1.100'
    scope: str             # 'localhost', 'private', 'public'
    interface_type: str    # 'wifi', 'ethernet', 'vpn', 'loopback'

def analyze_network_interfaces() -> List[NetworkInterface]:
    """Analyze all network interfaces server is bound to"""
    interfaces = []

    for iface in netifaces.interfaces():
        addrs = netifaces.ifaddresses(iface)

        # Get IPv4 addresses
        if netifaces.AF_INET in addrs:
            for addr_info in addrs[netifaces.AF_INET]:
                ip = addr_info.get('addr')
                if not ip:
                    continue

                # Classify IP scope
                scope = classify_ip_scope(ip)

                # Determine interface type
                iface_type = infer_interface_type(iface, ip)

                if scope != 'localhost':  # Skip 127.0.0.1
                    interfaces.append(NetworkInterface(
                        name=iface,
                        ip=ip,
                        scope=scope,
                        interface_type=iface_type
                    ))

    return interfaces

def classify_ip_scope(ip: str) -> str:
    """Classify IP address as localhost, private, or public"""
    try:
        addr = ipaddress.ip_address(ip)

        if addr.is_loopback:
            return 'localhost'     # 127.0.0.1
        elif addr.is_private:
            return 'private'       # 10.x.x.x, 172.16-31.x.x, 192.168.x.x
        elif addr.is_link_local:
            return 'link_local'    # 169.254.x.x (APIPA)
        else:
            return 'public'        # Routable internet address

    except ValueError:
        return 'unknown'

def infer_interface_type(iface: str, ip: str) -> str:
    """Guess interface type from name and IP"""
    name_lower = iface.lower()

    # Common interface name patterns
    if 'lo' in name_lower:
        return 'loopback'
    elif 'wlan' in name_lower or 'wifi' in name_lower or 'en0' == iface:
        # macOS: en0 is typically WiFi
        return 'wifi'
    elif 'eth' in name_lower or 'en1' == iface:
        # macOS: en1 is typically Ethernet (though can vary)
        return 'ethernet'
    elif 'tun' in name_lower or 'tap' in name_lower or 'utun' in name_lower:
        return 'vpn'
    elif 'docker' in name_lower or 'br-' in name_lower:
        return 'docker'
    elif 'vmnet' in name_lower or 'vboxnet' in name_lower:
        return 'virtual'
    else:
        return 'unknown'

# Example output:
interfaces = analyze_network_interfaces()
# [
#   NetworkInterface(name='en0', ip='192.168.1.100', scope='private', interface_type='wifi'),
#   NetworkInterface(name='utun2', ip='10.8.0.5', scope='private', interface_type='vpn')
# ]
```

**Exposure Classification**:
```python
@dataclass
class ExposureStatus:
    level: str                          # 'safe', 'lan', 'internet'
    interfaces: List[NetworkInterface]
    risks: List[str]
    recommendations: List[str]

def determine_exposure(host: str, port: int) -> ExposureStatus:
    """Determine exposure level based on binding and interfaces"""

    # If bound to localhost only, always safe
    if host == '127.0.0.1' or host == 'localhost':
        return ExposureStatus(
            level='safe',
            interfaces=[],
            risks=[],
            recommendations=[]
        )

    # Analyze actual network interfaces
    interfaces = analyze_network_interfaces()

    # Categorize interfaces
    wifi_interfaces = [i for i in interfaces if i.interface_type == 'wifi']
    public_interfaces = [i for i in interfaces if i.scope == 'public']
    vpn_interfaces = [i for i in interfaces if i.interface_type == 'vpn']

    risks = []
    recommendations = []

    # Public IP = Internet exposed
    if public_interfaces:
        recommendations.append(f"Immediately stop server and restart with: apantli --host 127.0.0.1")
        recommendations.append("Configure firewall to block port {port}")

        for iface in public_interfaces:
            risks.append(f"Server accessible from internet via {iface.ip}")

        return ExposureStatus(
            level='internet',
            interfaces=public_interfaces,
            risks=risks,
            recommendations=recommendations
        )

    # WiFi on private network = LAN exposed
    if wifi_interfaces:
        risks.append("Anyone on your WiFi network can access this server")

        # Check if on public WiFi (heuristic: certain IP ranges)
        for iface in wifi_interfaces:
            if iface.ip.startswith('192.168.43.') or iface.ip.startswith('10.0.1.'):
                # Common public WiFi ranges
                risks.append("⚠️  May be on public WiFi (coffee shop, airport, etc.)")

        recommendations.append(f"For localhost only: apantli --host 127.0.0.1")
        recommendations.append("Or enable firewall to restrict access")

        return ExposureStatus(
            level='lan',
            interfaces=wifi_interfaces,
            risks=risks,
            recommendations=recommendations
        )

    # Only VPN or wired = Lower risk but still exposed
    if vpn_interfaces or interfaces:
        risks.append("Server accessible on local network")
        recommendations.append("Consider binding to localhost for maximum security")

        return ExposureStatus(
            level='lan',
            interfaces=interfaces,
            risks=risks,
            recommendations=recommendations
        )

    # No interfaces found (shouldn't happen)
    return ExposureStatus(
        level='unknown',
        interfaces=[],
        risks=['Could not determine network exposure'],
        recommendations=['Restart with --host 127.0.0.1 to be safe']
    )
```

### Layer 2: Firewall Detection

**Goal**: Check if OS firewall is configured to block the port

**macOS Implementation**:
```python
import subprocess
import re

def check_macos_firewall(port: int) -> dict:
    """Check macOS Application Firewall status"""
    result = {
        'detected': True,
        'type': 'macos_application_firewall',
        'enabled': False,
        'blocking_port': False,
        'details': {}
    }

    try:
        # Check if firewall is enabled
        check_enabled = subprocess.run(
            ['/usr/libexec/ApplicationFirewall/socketfilterfw', '--getglobalstate'],
            capture_output=True,
            text=True,
            timeout=5
        )

        result['enabled'] = 'enabled' in check_enabled.stdout.lower()

        if not result['enabled']:
            result['details']['warning'] = 'Firewall is disabled'
            return result

        # Check if Python is allowed
        check_python = subprocess.run(
            ['/usr/libexec/ApplicationFirewall/socketfilterfw', '--listapps'],
            capture_output=True,
            text=True,
            timeout=5
        )

        # Look for Python in allowed apps
        python_allowed = False
        for line in check_python.stdout.split('\n'):
            if 'python' in line.lower():
                if '( BLOCK all connections )' in line:
                    result['blocking_port'] = True
                    result['details']['status'] = 'Python blocked by firewall'
                else:
                    python_allowed = True
                    result['details']['status'] = 'Python allowed through firewall'
                break

        if not python_allowed and not result['blocking_port']:
            result['details']['status'] = 'Python not in firewall rules (default allow)'

        # Note: Application firewall doesn't do per-port filtering
        # It's all-or-nothing per application

    except subprocess.TimeoutExpired:
        result['details']['error'] = 'Firewall check timed out'
    except FileNotFoundError:
        result['detected'] = False
        result['details']['error'] = 'Application firewall not found'
    except Exception as e:
        result['details']['error'] = str(e)

    return result
```

**Linux Implementation**:
```python
def check_linux_firewall(port: int) -> dict:
    """Check Linux firewall (ufw, firewalld, iptables)"""

    # Try ufw first (Ubuntu/Debian)
    ufw_result = check_ufw(port)
    if ufw_result['detected']:
        return ufw_result

    # Try firewalld (RHEL/CentOS/Fedora)
    firewalld_result = check_firewalld(port)
    if firewalld_result['detected']:
        return firewalld_result

    # Try iptables (everywhere)
    iptables_result = check_iptables(port)
    if iptables_result['detected']:
        return iptables_result

    return {'detected': False, 'details': {'error': 'No firewall detected'}}

def check_ufw(port: int) -> dict:
    """Check ufw (Uncomplicated Firewall)"""
    result = {'detected': False, 'type': 'ufw', 'enabled': False, 'blocking_port': False}

    try:
        # Check status
        status = subprocess.run(
            ['ufw', 'status', 'numbered'],
            capture_output=True,
            text=True,
            timeout=5
        )

        if status.returncode != 0:
            return result

        result['detected'] = True
        result['enabled'] = 'Status: active' in status.stdout

        if not result['enabled']:
            return result

        # Check for port rules
        # Example output:
        # [ 1] 22/tcp                     ALLOW IN    Anywhere
        # [ 2] 4000/tcp                   DENY IN     Anywhere

        for line in status.stdout.split('\n'):
            if f'{port}/tcp' in line or f'{port}/' in line:
                if 'DENY' in line or 'REJECT' in line:
                    result['blocking_port'] = True
                elif 'ALLOW' in line:
                    result['blocking_port'] = False

                result['details'] = {'rule': line.strip()}
                break

    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return result

def check_firewalld(port: int) -> dict:
    """Check firewalld"""
    result = {'detected': False, 'type': 'firewalld', 'enabled': False, 'blocking_port': False}

    try:
        # Check if running
        status = subprocess.run(
            ['firewall-cmd', '--state'],
            capture_output=True,
            text=True,
            timeout=5
        )

        if status.returncode != 0:
            return result

        result['detected'] = True
        result['enabled'] = 'running' in status.stdout.lower()

        if not result['enabled']:
            return result

        # Check port
        port_check = subprocess.run(
            ['firewall-cmd', '--query-port', f'{port}/tcp'],
            capture_output=True,
            text=True,
            timeout=5
        )

        # Exit code 0 = port allowed, 1 = port blocked
        result['blocking_port'] = port_check.returncode != 0

    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return result

def check_iptables(port: int) -> dict:
    """Check iptables"""
    result = {'detected': False, 'type': 'iptables', 'enabled': False, 'blocking_port': False}

    try:
        # List rules
        rules = subprocess.run(
            ['iptables', '-L', '-n', '--line-numbers'],
            capture_output=True,
            text=True,
            timeout=5
        )

        if rules.returncode != 0:
            return result

        result['detected'] = True

        # Check if there are any rules (more than just policy lines)
        rule_lines = [l for l in rules.stdout.split('\n') if l and not l.startswith('Chain') and not l.startswith('target')]
        result['enabled'] = len(rule_lines) > 0

        # Check for port-specific rules
        # Example: DROP       tcp  --  0.0.0.0/0            0.0.0.0/0            tcp dpt:4000
        for line in rules.stdout.split('\n'):
            if f'dpt:{port}' in line:
                if 'DROP' in line or 'REJECT' in line:
                    result['blocking_port'] = True
                elif 'ACCEPT' in line:
                    result['blocking_port'] = False

    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        pass

    return result
```

### Layer 3: Active Connection Monitoring

**Goal**: Detect who is currently connected

**Implementation**:
```python
import psutil
from datetime import datetime

@dataclass
class ActiveConnection:
    remote_ip: str
    remote_port: int
    established_at: datetime
    scope: str              # 'localhost', 'private', 'public'
    reverse_dns: Optional[str]

def get_active_connections(port: int) -> List[ActiveConnection]:
    """Get all active connections to the server port"""
    connections = []

    try:
        for conn in psutil.net_connections(kind='inet'):
            # Filter for our port and established connections
            if conn.laddr.port == port and conn.status == 'ESTABLISHED':
                if not conn.raddr:
                    continue

                remote_ip = conn.raddr.ip
                remote_port = conn.raddr.port

                # Skip localhost connections
                if remote_ip.startswith('127.'):
                    continue

                # Classify remote IP
                scope = classify_ip_scope(remote_ip)

                # Try reverse DNS lookup
                reverse_dns = None
                try:
                    import socket
                    reverse_dns = socket.gethostbyaddr(remote_ip)[0]
                except:
                    pass

                connections.append(ActiveConnection(
                    remote_ip=remote_ip,
                    remote_port=remote_port,
                    established_at=datetime.now(),  # psutil doesn't provide this
                    scope=scope,
                    reverse_dns=reverse_dns
                ))

    except PermissionError:
        # On some systems, need root to see all connections
        pass

    return connections

# Example usage:
active = get_active_connections(4000)
# [
#   ActiveConnection(
#     remote_ip='192.168.1.105',
#     remote_port=52341,
#     established_at=datetime(2025, 11, 23, 10, 30, 15),
#     scope='private',
#     reverse_dns='MacBook-Pro-2.local'
#   )
# ]
```

**Connection History Tracking**:
```python
class ConnectionMonitor:
    def __init__(self, db: Database, port: int):
        self.db = db
        self.port = port
        self.known_connections = set()

    async def monitor_loop(self):
        """Continuously monitor for new connections"""
        while True:
            connections = get_active_connections(self.port)
            current_ips = {conn.remote_ip for conn in connections}

            # Detect new connections
            new_ips = current_ips - self.known_connections

            for conn in connections:
                if conn.remote_ip in new_ips:
                    # Log new connection
                    await self.log_connection(conn)

                    # Alert if suspicious
                    if conn.scope == 'public':
                        await self.alert_internet_connection(conn)
                    elif self.is_suspicious(conn):
                        await self.alert_suspicious_connection(conn)

            # Update known connections
            self.known_connections = current_ips

            # Check every 30 seconds
            await asyncio.sleep(30)

    async def log_connection(self, conn: ActiveConnection):
        """Log connection to database"""
        await self.db.execute("""
            INSERT INTO connection_log
            (timestamp, remote_ip, remote_port, scope, reverse_dns)
            VALUES (?, ?, ?, ?, ?)
        """, (
            datetime.now().isoformat(),
            conn.remote_ip,
            conn.remote_port,
            conn.scope,
            conn.reverse_dns
        ))

    def is_suspicious(self, conn: ActiveConnection) -> bool:
        """Heuristics to detect suspicious connections"""
        # Unknown hostname
        if not conn.reverse_dns:
            return True

        # Public WiFi IP ranges
        suspicious_ranges = [
            '192.168.43.',  # Common Android hotspot
            '10.0.1.',      # Common public WiFi
            '172.20.',      # iOS hotspot
        ]

        for prefix in suspicious_ranges:
            if conn.remote_ip.startswith(prefix):
                return True

        return False

    async def alert_internet_connection(self, conn: ActiveConnection):
        """Alert on internet connection (CRITICAL)"""
        await self.send_alert({
            'severity': 'critical',
            'type': 'internet_connection',
            'message': f'Connection from internet IP {conn.remote_ip}!',
            'details': conn.__dict__
        })

    async def alert_suspicious_connection(self, conn: ActiveConnection):
        """Alert on suspicious connection"""
        await self.send_alert({
            'severity': 'warning',
            'type': 'suspicious_connection',
            'message': f'Connection from unknown device {conn.remote_ip}',
            'details': conn.__dict__
        })
```

### Layer 4: Public IP Detection

**Goal**: Determine if server is reachable from internet

**Public IP Lookup**:
```python
import aiohttp

async def get_public_ip() -> Optional[str]:
    """Get public IP address via external service"""
    services = [
        'https://ifconfig.me/ip',
        'https://api.ipify.org',
        'https://icanhazip.com',
        'https://ident.me'
    ]

    async with aiohttp.ClientSession() as session:
        for service in services:
            try:
                async with session.get(service, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        public_ip = (await resp.text()).strip()
                        # Validate IP format
                        ipaddress.ip_address(public_ip)
                        return public_ip
            except:
                continue

    return None
```

**Port Accessibility Test** (Optional, with user consent):
```python
async def test_port_accessibility(port: int, public_ip: str) -> dict:
    """Test if port is accessible from internet

    WARNING: Only call with explicit user consent!
    Makes external API request that could log your IP.
    """

    # Using a port checker service
    # NOTE: This is a hypothetical API - implement with care
    async with aiohttp.ClientSession() as session:
        try:
            # Some port checking services:
            # - https://www.yougetsignal.com/tools/open-ports/
            # - Custom implementation with VPS making request back
            # - User-run script from external machine

            # Example with custom check
            check_url = f'https://port-check-service.example.com/check'
            async with session.post(check_url, json={
                'ip': public_ip,
                'port': port,
                'protocol': 'tcp'
            }, timeout=aiohttp.ClientTimeout(total=10)) as resp:

                if resp.status == 200:
                    result = await resp.json()
                    return {
                        'accessible': result.get('open', False),
                        'tested': True,
                        'details': result
                    }

        except Exception as e:
            return {
                'accessible': False,
                'tested': False,
                'error': str(e)
            }

    return {'accessible': False, 'tested': False}
```

## Integrated Security Dashboard

### Real-Time Security Status

**New Dashboard Tab**: "Security"

```html
<div class="security-dashboard">
  <!-- Overall Status -->
  <div class="status-card" :class="exposure.level">
    <div class="status-icon">
      <span v-if="exposure.level === 'safe'">🟢</span>
      <span v-else-if="exposure.level === 'lan'">🟡</span>
      <span v-else>🔴</span>
    </div>

    <div class="status-details">
      <h2 v-if="exposure.level === 'safe'">Secure (Localhost Only)</h2>
      <h2 v-else-if="exposure.level === 'lan'">LAN Exposed</h2>
      <h2 v-else>⚠️ INTERNET EXPOSED</h2>

      <p class="status-description">
        <span v-if="exposure.level === 'safe'">
          Server is only accessible from this computer. Safe for development.
        </span>
        <span v-else-if="exposure.level === 'lan'">
          Server is accessible on your local network. Only use on trusted networks.
        </span>
        <span v-else>
          🚨 Server may be accessible from the internet! This is DANGEROUS.
        </span>
      </p>
    </div>
  </div>

  <!-- Network Interfaces -->
  <div class="interfaces-section">
    <h3>Network Interfaces</h3>
    <div class="interface-list">
      <div v-for="iface in exposure.interfaces" class="interface-card">
        <div class="interface-icon">
          <span v-if="iface.type === 'wifi'">📡</span>
          <span v-else-if="iface.type === 'ethernet'">🔌</span>
          <span v-else-if="iface.type === 'vpn'">🔒</span>
          <span v-else>🌐</span>
        </div>

        <div class="interface-details">
          <strong>{{ iface.name }}</strong>
          <code>{{ iface.ip }}</code>
          <span class="scope-badge" :class="iface.scope">{{ iface.scope }}</span>
        </div>

        <div class="interface-actions">
          <button @click="testInterface(iface)">Test Connectivity</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Firewall Status -->
  <div class="firewall-section">
    <h3>Firewall Status</h3>
    <div class="firewall-card">
      <div v-if="firewall.detected">
        <p><strong>Type:</strong> {{ firewall.type }}</p>
        <p><strong>Enabled:</strong>
          <span v-if="firewall.enabled" class="status-good">✅ Yes</span>
          <span v-else class="status-bad">❌ No</span>
        </p>
        <p><strong>Port {{ port }} Status:</strong>
          <span v-if="firewall.blocking_port" class="status-good">🛡️ Blocked</span>
          <span v-else class="status-warning">⚠️ Allowed</span>
        </p>
      </div>
      <div v-else>
        <p class="status-warning">⚠️ No firewall detected</p>
      </div>

      <button @click="showFirewallGuide()">Configure Firewall</button>
    </div>
  </div>

  <!-- Active Connections -->
  <div class="connections-section">
    <h3>Active Connections (Last Hour)</h3>

    <div v-if="activeConnections.length === 0">
      <p class="no-connections">No external connections detected</p>
    </div>

    <table v-else class="connections-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Remote IP</th>
          <th>Hostname</th>
          <th>Type</th>
          <th>Requests</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="conn in activeConnections" :class="{'suspicious': conn.suspicious}">
          <td>{{ formatTime(conn.timestamp) }}</td>
          <td><code>{{ conn.remote_ip }}</code></td>
          <td>{{ conn.reverse_dns || 'Unknown' }}</td>
          <td><span class="scope-badge" :class="conn.scope">{{ conn.scope }}</span></td>
          <td>{{ conn.request_count }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Risk Assessment -->
  <div class="risks-section" v-if="exposure.risks.length > 0">
    <h3>⚠️ Security Risks</h3>
    <ul class="risk-list">
      <li v-for="risk in exposure.risks" class="risk-item">{{ risk }}</li>
    </ul>
  </div>

  <!-- Recommendations -->
  <div class="recommendations-section" v-if="exposure.recommendations.length > 0">
    <h3>🔧 Recommendations</h3>
    <ul class="recommendation-list">
      <li v-for="rec in exposure.recommendations" class="recommendation-item">
        {{ rec }}
      </li>
    </ul>

    <div class="quick-actions">
      <button @click="applySecureConfig()" class="btn-primary">
        🔒 Apply Secure Configuration
      </button>
    </div>
  </div>
</div>
```

### JavaScript Implementation

```javascript
export default {
  data() {
    return {
      exposure: { level: 'unknown', interfaces: [], risks: [], recommendations: [] },
      firewall: { detected: false },
      activeConnections: [],
      port: 4000,
      ws: null
    }
  },

  async mounted() {
    await this.loadSecurityStatus();
    this.connectWebSocket();

    // Refresh every 60 seconds
    setInterval(() => this.loadSecurityStatus(), 60000);
  },

  methods: {
    async loadSecurityStatus() {
      const [exposure, firewall, connections] = await Promise.all([
        fetch('/api/security/exposure').then(r => r.json()),
        fetch('/api/security/firewall').then(r => r.json()),
        fetch('/api/security/connections').then(r => r.json())
      ]);

      this.exposure = exposure;
      this.firewall = firewall;
      this.activeConnections = connections;
    },

    connectWebSocket() {
      this.ws = new WebSocket('ws://localhost:4000/ws/security');

      this.ws.onmessage = (event) => {
        const alert = JSON.parse(event.data);

        if (alert.type === 'new_connection') {
          this.showConnectionAlert(alert);
          this.loadSecurityStatus();  // Refresh
        } else if (alert.type === 'exposure_change') {
          this.showExposureAlert(alert);
          this.loadSecurityStatus();
        }
      };
    },

    showConnectionAlert(alert) {
      // Show browser notification
      if (Notification.permission === 'granted') {
        new Notification('New Connection Detected', {
          body: `${alert.remote_ip} (${alert.scope}) connected to Apantli`,
          icon: '/static/warning-icon.png'
        });
      }

      // Show in-app notification
      this.showNotification({
        type: alert.severity === 'critical' ? 'error' : 'warning',
        title: 'New Connection',
        message: `${alert.remote_ip} connected`,
        duration: 10000
      });
    },

    async applySecureConfig() {
      // Call API to restart server with --host 127.0.0.1
      const confirmed = confirm(
        'This will restart the server in localhost-only mode. ' +
        'You will no longer be able to access Apantli from other devices. ' +
        'Continue?'
      );

      if (!confirmed) return;

      try {
        await fetch('/api/security/apply-localhost', { method: 'POST' });
        this.showNotification({
          type: 'success',
          title: 'Security Applied',
          message: 'Server will restart in localhost-only mode...'
        });

        // Reload page after restart
        setTimeout(() => window.location.reload(), 3000);
      } catch (err) {
        this.showNotification({
          type: 'error',
          title: 'Error',
          message: 'Could not apply secure configuration: ' + err.message
        });
      }
    },

    showFirewallGuide() {
      // Show modal with OS-specific firewall instructions
      this.showModal({
        title: 'Configure Firewall',
        content: this.getFirewallInstructions()
      });
    },

    getFirewallInstructions() {
      const os = this.detectOS();

      if (os === 'macos') {
        return `
          <h4>macOS Firewall Setup</h4>
          <ol>
            <li>Open System Preferences → Security & Privacy → Firewall</li>
            <li>Click "Firewall Options"</li>
            <li>Find Python in the list</li>
            <li>Set to "Block incoming connections"</li>
          </ol>

          <p>Or use the command line:</p>
          <pre>
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/python3
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --block /usr/local/bin/python3
          </pre>
        `;
      } else if (os === 'linux') {
        return `
          <h4>Linux Firewall Setup (ufw)</h4>
          <pre>
# Enable firewall
sudo ufw enable

# Block port 4000 from external access
sudo ufw deny 4000/tcp

# Allow from localhost (if needed)
sudo ufw allow from 127.0.0.1 to any port 4000
          </pre>
        `;
      }

      return '<p>Firewall instructions not available for your OS</p>';
    }
  }
}
```

## API Endpoints

```python
@app.get("/api/security/exposure")
async def get_exposure_status(request: Request):
    """Get current exposure status"""
    host = request.app.state.host
    port = request.app.state.port

    exposure = determine_exposure(host, port)

    return {
        'level': exposure.level,
        'interfaces': [
            {
                'name': i.name,
                'ip': i.ip,
                'scope': i.scope,
                'type': i.interface_type
            }
            for i in exposure.interfaces
        ],
        'risks': exposure.risks,
        'recommendations': exposure.recommendations
    }

@app.get("/api/security/firewall")
async def get_firewall_status(request: Request):
    """Get firewall status"""
    port = request.app.state.port

    import platform
    system = platform.system()

    if system == 'Darwin':
        firewall = check_macos_firewall(port)
    elif system == 'Linux':
        firewall = check_linux_firewall(port)
    else:
        firewall = {'detected': False}

    return firewall

@app.get("/api/security/connections")
async def get_active_connections(request: Request):
    """Get active connections with request counts"""
    port = request.app.state.port
    db = request.app.state.db

    # Get currently active connections
    active = get_active_connections(port)

    # Enrich with request counts from last hour
    connections = []
    for conn in active:
        request_count = await db.query("""
            SELECT COUNT(*) as count
            FROM requests
            WHERE timestamp > datetime('now', '-1 hour')
              AND json_extract(request_data, '$.remote_ip') = ?
        """, [conn.remote_ip])

        connections.append({
            'remote_ip': conn.remote_ip,
            'reverse_dns': conn.reverse_dns,
            'scope': conn.scope,
            'timestamp': conn.established_at.isoformat(),
            'request_count': request_count[0]['count'] if request_count else 0,
            'suspicious': not conn.reverse_dns  # Heuristic
        })

    return connections

@app.post("/api/security/apply-localhost")
async def apply_localhost_only(request: Request):
    """Restart server in localhost-only mode"""

    # This would require server management capability
    # Options:
    # 1. Update config file and restart via systemd/launchd
    # 2. Set environment variable and restart
    # 3. Use supervisord or similar to manage restart

    # For now, just update config
    config_path = request.app.state.config_path

    # Read current args
    # Update --host to 127.0.0.1
    # Restart server

    return {'status': 'restarting', 'message': 'Server will restart in localhost mode'}
```

## Startup Warning System

```python
def main():
    """Entry point with security checks"""
    args = parse_args()

    # Store in app.state for later use
    app.state.host = args.host
    app.state.port = args.port

    # Perform security analysis
    exposure = determine_exposure(args.host, args.port)
    firewall = check_firewall(args.port)

    # Print banner
    print("\n🚀 Apantli server starting...\n")

    # Print exposure status
    if exposure.level == 'safe':
        print("✅ Security: Localhost only (safe)")
        print(f"   Server at http://localhost:{args.port}/\n")

    elif exposure.level == 'lan':
        print("⚠️  Security: LAN exposed\n")
        print(f"   Server accessible on local network:")
        for iface in exposure.interfaces:
            print(f"     • http://{iface.ip}:{args.port}/ ({iface.name} - {iface.interface_type})")
        print()

        # Show risks
        if exposure.risks:
            print("   Risks:")
            for risk in exposure.risks:
                print(f"     ⚠️  {risk}")
            print()

        # Show recommendations
        print("   To restrict to localhost: apantli --host 127.0.0.1")
        print()

    elif exposure.level == 'internet':
        print("🔴 CRITICAL SECURITY WARNING: Internet exposed!\n")

        for iface in exposure.interfaces:
            print(f"   Public IP: {iface.ip}")

        print(f"\n   🚨 Port {args.port} may be accessible from the INTERNET!\n")
        print("   This means:")
        print("     • Anyone can access your LLM proxy")
        print("     • Your API keys are exposed")
        print("     • Your conversation history is visible")
        print()
        print("   IMMEDIATE ACTION REQUIRED:")
        print("     1. Stop server (Ctrl+C)")
        print("     2. Restart with: apantli --host 127.0.0.1")
        print("     3. Or configure firewall to block port 4000")
        print()

        # Require explicit confirmation
        response = input("   Type 'I understand the risk' to continue: ")
        if response != "I understand the risk":
            print("\n   Aborted for safety.\n")
            sys.exit(1)

    # Firewall warning
    if firewall['detected'] and firewall['enabled']:
        if not firewall.get('blocking_port'):
            print(f"⚠️  Firewall is enabled but allowing port {args.port}")
            print(f"   Consider blocking this port for maximum security\n")

    # Start server
    uvicorn.run(app, host=args.host, port=args.port, ...)
```

## Success Metrics

**User Awareness**:
- 100% of users see security status on startup
- 80% of users understand their exposure level
- 50% of users enable localhost-only mode

**Security Posture**:
- 0 unintentional internet exposures
- 90% reduction in LAN exposure (vs default 0.0.0.0 binding)
- 70% of users configure firewall

**Incident Detection**:
- 100% of new connections detected within 30 seconds
- 100% of internet exposures alerted immediately
- 0 false positives on connection alerts

