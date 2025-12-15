// import http from "http";
// import { Server } from "socket.io";
// import { io as ClientIO } from "socket.io-client";

// const PORT = process.env.PORT || 3000;
// const TARGET = process.env.TARGET || "https://api.flip.gg";
// const FIXED_ORIGIN = process.env.ORIGIN || "https://flip.gg";
// const FIXED_HOST = process.env.HOST || "api.flip.gg";

// // Simple HTTP health check
// const server = http.createServer((req, res) => {
//   console.log(`[HTTP] ${req.method} ${req.url}`);
  
//   if (req.url === "/" || req.url === "/health") {
//     res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
//     res.end("Socket.IO proxy alive\n");
//     return;
//   }
//   res.writeHead(404);
//   res.end();
// });

// // Socket.IO server for frontend clients
// const io = socketio(server, {
//   path: "/socket.io",
//   transports: ["polling", "websocket"],
//   cors: {
//     origin: "*",
//     methods: ["GET", "POST"]
//   }
// });

// console.log("[Proxy] Socket.IO server initialized");

// // Keep a map of backend sockets per frontend socket
// const backendSockets = new Map();

// /**
//  * Create a backend socket connection for a specific namespace
//  */
// function createBackendSocket(clientSocket, namespace) {
//   const nsName = namespace.name;
//   const handshake = clientSocket.handshake;
  
//   console.log(`\n======= [Proxy] NAMESPACE CONNECTION =======`);
//   console.log(`[Proxy] Frontend namespace connection:`, {
//     socketId: clientSocket.id,
//     namespace: nsName,
//     handshake: {
//       query: handshake.query,
//       headers: handshake.headers,
//       url: handshake.url
//     }
//   });

//   // Build backend URL for namespace
//   let backendUrl = TARGET;
//   if (nsName !== "/") {
//     backendUrl = TARGET.replace(/\/$/, "") + nsName;
//   }
  
//   console.log(`[Proxy] Backend namespace connection:`, {
//     originalTarget: TARGET,
//     finalBackendUrl: backendUrl,
//     namespaceName: nsName
//   });

//   // Forward frontend handshake query + cookies
//   const clientQuery = clientSocket.handshake.query || {};
//   const cookieHeader = clientSocket.handshake.headers?.cookie;
//   const authHeader = clientSocket.handshake.headers?.authorization;

//   // Socket.IO client options
//   const backendOpts = {
//     path: "/socket.io",
//     transports: ["polling", "websocket"],
//     query: clientQuery,
//     reconnection: false,
//     timeout: 10000,
//     forceNew: true,
//     extraHeaders: {
//       ...(cookieHeader ? { cookie: cookieHeader } : {}),
//       ...(authHeader ? { authorization: authHeader } : {}),
//       origin: FIXED_ORIGIN,
//       host: FIXED_HOST,
//       "user-agent": "Socket.IO-Proxy/2.0",
//       "x-proxy-client-id": clientSocket.id,
//       "x-proxy-namespace": nsName
//     }
//   };

//   console.log(`[Proxy] Creating backend socket for namespace: ${backendUrl}`);
//   const backendSocket = socketioClient(backendUrl, backendOpts);

//   let backendConnected = false;

//   // Backend socket event listeners
//   backendSocket.on("connect", () => {
//     console.log(`\n✅ [Backend] NAMESPACE CONNECTED:`, {
//       clientId: clientSocket.id,
//       namespace: nsName,
//       backendUrl: backendUrl
//     });
//     backendConnected = true;
    
//     // Notify frontend that namespace is ready
//     clientSocket.emit("namespace_ready", { namespace: nsName });
//   });

//   backendSocket.on("disconnect", (reason) => {
//     console.log(`\n❌ [Backend] NAMESPACE DISCONNECTED:`, {
//       clientId: clientSocket.id,
//       namespace: nsName,
//       reason: reason
//     });
//     backendConnected = false;
    
//     clientSocket.emit("namespace_disconnected", { namespace: nsName, reason });
//   });

//   backendSocket.on("connect_error", (err) => {
//     console.log(`\n🔥 [Backend] NAMESPACE CONNECT_ERROR:`, {
//       clientId: clientSocket.id,
//       namespace: nsName,
//       error: err && err.message
//     });
    
//     clientSocket.emit("namespace_error", { 
//       namespace: nsName, 
//       error: err && err.message 
//     });
//   });

//   backendSocket.on("error", (err) => {
//     console.warn(`[Backend] Namespace socket error:`, {
//       namespace: nsName,
//       error: err && err.message
//     });
//   });

//   // Forward ALL events from backend to frontend namespace
//   const originalBackendOnevent = backendSocket.onevent;
//   backendSocket.onevent = function(packet) {
//     const args = packet.data || [];
    
//     if (args.length > 0) {
//       const event = args[0];
//       const eventArgs = args.slice(1);
      
//       // Don't log ping/pong events to reduce noise
//       if (event !== 'ping' && event !== 'pong') {
//         console.log(`[Backend->Frontend] ${nsName} Event: ${event}`, {
//           args: eventArgs,
//           clientId: clientSocket.id
//         });
//       }
      
//       try {
//         clientSocket.emit(event, ...eventArgs);
//       } catch (e) {
//         console.warn(`[Backend->Frontend] Error forwarding event '${event}' in ${nsName}:`, e);
//       }
//     }
    
//     if (originalBackendOnevent) {
//       originalBackendOnevent.call(this, packet);
//     }
//   };

//   // Forward ALL events from frontend namespace to backend
//   const originalClientOnevent = clientSocket.onevent;
//   clientSocket.onevent = function(packet) {
//     const args = packet.data || [];
    
//     if (args.length > 0) {
//       const event = args[0];
//       const eventArgs = args.slice(1);
      
//       // Skip internal events
//       if (event === 'disconnect' || event === 'connect_error' || 
//           event === 'namespace_ready' || event === 'namespace_disconnected' || 
//           event === 'namespace_error') {
//         if (originalClientOnevent) {
//           originalClientOnevent.call(this, packet);
//         }
//         return;
//       }
      
//       // Don't log ping/pong events to reduce noise
//       if (event !== 'ping' && event !== 'pong') {
//         console.log(`[Frontend->Backend] ${nsName} Event: ${event}`, {
//           args: eventArgs,
//           clientId: clientSocket.id,
//           backendConnected: backendConnected
//         });
//       }
      
//       if (backendConnected) {
//         try {
//           // Handle ACK callbacks
//           const lastArg = eventArgs[eventArgs.length - 1];
//           if (typeof lastArg === 'function') {
//             const ackCallback = eventArgs.pop();
//             backendSocket.emit(event, ...eventArgs, (...responseArgs) => {
//               try {
//                 ackCallback(...responseArgs);
//               } catch (e) {
//                 console.warn(`[Frontend->Backend] ACK error for event '${event}' in ${nsName}:`, e);
//               }
//             });
//           } else {
//             backendSocket.emit(event, ...eventArgs);
//           }
//         } catch (e) {
//           console.warn(`[Frontend->Backend] Error forwarding event '${event}' in ${nsName}:`, e);
//         }
//       } else {
//         console.log(`[Frontend->Backend] Backend not connected for ${nsName}, skipping event: ${event}`);
//       }
//     }
    
//     if (originalClientOnevent) {
//       originalClientOnevent.call(this, packet);
//     }
//   };

//   // Store the backend socket for this namespace
//   const socketKey = `${clientSocket.id}-${nsName}`;
//   backendSockets.set(socketKey, backendSocket);

//   // Clean up on frontend namespace disconnect
//   clientSocket.on("disconnect", (reason) => {
//     console.log(`\n📤 [Frontend] NAMESPACE DISCONNECTED:`, {
//       socketId: clientSocket.id,
//       namespace: nsName,
//       reason: reason
//     });
    
//     try { 
//       if (backendSocket.connected) {
//         backendSocket.disconnect(); 
//       }
//     } catch (e) {}
//     backendSockets.delete(socketKey);
//   });

//   return backendSocket;
// }

// // Handle connections to the default namespace
// io.on("connection", (clientSocket) => {
//   console.log(`\n======= [Proxy] DEFAULT NAMESPACE CONNECTION =======`);
//   console.log(`[Proxy] Frontend connected to default namespace:`, clientSocket.id);
  
//   // Create backend connection for default namespace
//   createBackendSocket(clientSocket, clientSocket.nsp);
// });

// // Handle connections to custom namespaces
// io.of(/.*/).on("connection", (clientSocket) => {
//   const namespace = clientSocket.nsp;
//   const nsName = namespace.name;
  
//   // Skip the default namespace as it's handled above
//   if (nsName === "/") return;
  
//   console.log(`\n======= [Proxy] CUSTOM NAMESPACE CONNECTION =======`);
//   console.log(`[Proxy] Frontend connected to custom namespace:`, {
//     socketId: clientSocket.id,
//     namespace: nsName
//   });
  
//   // Create backend connection for this custom namespace
//   createBackendSocket(clientSocket, namespace);
// });

// // Log all available namespaces periodically
// setInterval(() => {
//   const namespaces = io._nsps ? Object.keys(io._nsps) : [];
//   console.log(`\n[NamespaceMonitor] Active namespaces:`, namespaces);
//   console.log(`[ConnectionMonitor] Active backend sockets: ${backendSockets.size}`);
// }, 30000);

// // Handle graceful shutdown
// process.on("SIGTERM", () => {
//   console.log("[Proxy] SIGTERM received, shutting down gracefully");
//   console.log(`[Proxy] Active connections to close: ${backendSockets.size}`);
  
//   backendSockets.forEach((backendSocket, key) => {
//     try {
//       console.log(`[Proxy] Disconnecting backend socket: ${key}`);
//       backendSocket.disconnect();
//     } catch (e) {}
//   });
  
//   server.close(() => {
//     console.log("[Proxy] Server closed");
//     process.exit(0);
//   });
// });

// server.listen(PORT, () => {
//   console.log(`\n🎯 [Proxy] Socket.IO v2 proxy listening on port ${PORT}`);
//   console.log(`🎯 [Proxy] Forwarding to target: ${TARGET}`);
//   console.log(`🎯 [Proxy] Fixed origin: ${FIXED_ORIGIN}`);
//   console.log(`🎯 [Proxy] Fixed host: ${FIXED_HOST}`);
//   console.log(`🎯 [Proxy] Ready for namespace connections...\n`);
// });

// // Log unhandled rejections
// process.on("unhandledRejection", (reason, promise) => {
//   console.error("[Proxy] Unhandled Rejection:", reason);
// });

// // Log uncaught exceptions
// process.on("uncaughtException", (error) => {
//   console.error("[Proxy] Uncaught Exception:", error);
//   process.exit(1);
// });
import http from "http";
import { Server } from "socket.io";
import { io as ClientIO } from "socket.io-client";

const PORT = process.env.PORT || 3000;
const TARGET = process.env.TARGET || "https://api.flip.gg";
const FIXED_ORIGIN = process.env.ORIGIN || "https://flip.gg";
const FIXED_HOST = process.env.HOST || "api.flip.gg";

// Simple HTTP health check
const server = http.createServer((req, res) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("Socket.IO proxy alive\n");
    return;
  }
  res.writeHead(404);
  res.end();
});

// Socket.IO server for frontend clients
const io = new Server(server, {
  path: "/socket.io",
  transports: ["polling", "websocket"],
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

console.log("[Proxy] Socket.IO server initialized");

// Keep a map of backend sockets per frontend socket
const backendSockets = new Map();

/**
 * Create a backend socket connection for a specific namespace
 */
function createBackendSocket(clientSocket, namespace) {
  const nsName = namespace.name;
  const handshake = clientSocket.handshake;
  
  console.log(`\n======= [Proxy] NAMESPACE CONNECTION =======`);
  console.log(`[Proxy] Frontend namespace connection:`, {
    socketId: clientSocket.id,
    namespace: nsName,
    handshake: {
      query: handshake.query,
      headers: handshake.headers,
      url: handshake.url
    }
  });

  // Build backend URL for namespace
  let backendUrl = TARGET;
  if (nsName !== "/") {
    backendUrl = TARGET.replace(/\/$/, "") + nsName;
  }
  
  console.log(`[Proxy] Backend namespace connection:`, {
    originalTarget: TARGET,
    finalBackendUrl: backendUrl,
    namespaceName: nsName
  });

  // Forward frontend handshake query + cookies
  const clientQuery = clientSocket.handshake.query || {};
  const cookieHeader = clientSocket.handshake.headers?.cookie;
  const authHeader = clientSocket.handshake.headers?.authorization;

  // Socket.IO client options
  const backendOpts = {
    path: "/socket.io",
    transports: ["polling", "websocket"],
    query: clientQuery,
    reconnection: false,
    timeout: 10000,
    forceNew: true,
    extraHeaders: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(authHeader ? { authorization: authHeader } : {}),
      origin: FIXED_ORIGIN,
      host: FIXED_HOST,
      "user-agent": "Socket.IO-Proxy/2.0",
      "x-proxy-client-id": clientSocket.id,
      "x-proxy-namespace": nsName
    }
  };

  console.log(`[Proxy] Creating backend socket for namespace: ${backendUrl}`);
  const backendSocket = ClientIO(backendUrl, backendOpts);

  let backendConnected = false;

  // Backend socket event listeners
  backendSocket.on("connect", () => {
    console.log(`\n✅ [Backend] NAMESPACE CONNECTED:`, {
      clientId: clientSocket.id,
      namespace: nsName,
      backendUrl: backendUrl
    });
    backendConnected = true;
    
    // Notify frontend that namespace is ready
    clientSocket.emit("namespace_ready", { namespace: nsName });
  });

  backendSocket.on("disconnect", (reason) => {
    console.log(`\n❌ [Backend] NAMESPACE DISCONNECTED:`, {
      clientId: clientSocket.id,
      namespace: nsName,
      reason: reason
    });
    backendConnected = false;
    
    clientSocket.emit("namespace_disconnected", { namespace: nsName, reason });
  });

  backendSocket.on("connect_error", (err) => {
    console.log(`\n🔥 [Backend] NAMESPACE CONNECT_ERROR:`, {
      clientId: clientSocket.id,
      namespace: nsName,
      error: err && err.message
    });
    
    clientSocket.emit("namespace_error", { 
      namespace: nsName, 
      error: err && err.message 
    });
  });

  backendSocket.on("error", (err) => {
    console.warn(`[Backend] Namespace socket error:`, {
      namespace: nsName,
      error: err && err.message
    });
  });

  // Forward ALL events from backend to frontend namespace
  const originalBackendOnevent = backendSocket.onevent;
  backendSocket.onevent = function(packet) {
    const args = packet.data || [];
    
    if (args.length > 0) {
      const event = args[0];
      const eventArgs = args.slice(1);
      
      // Don't log ping/pong events to reduce noise
      if (event !== 'ping' && event !== 'pong') {
        console.log(`[Backend->Frontend] ${nsName} Event: ${event}`, {
          args: eventArgs,
          clientId: clientSocket.id
        });
      }
      
      try {
        clientSocket.emit(event, ...eventArgs);
      } catch (e) {
        console.warn(`[Backend->Frontend] Error forwarding event '${event}' in ${nsName}:`, e);
      }
    }
    
    if (originalBackendOnevent) {
      originalBackendOnevent.call(this, packet);
    }
  };

  // Forward ALL events from frontend namespace to backend
  const originalClientOnevent = clientSocket.onevent;
  clientSocket.onevent = function(packet) {
    const args = packet.data || [];
    
    if (args.length > 0) {
      const event = args[0];
      const eventArgs = args.slice(1);
      
      // Skip internal events
      if (event === 'disconnect' || event === 'connect_error' || 
          event === 'namespace_ready' || event === 'namespace_disconnected' || 
          event === 'namespace_error') {
        if (originalClientOnevent) {
          originalClientOnevent.call(this, packet);
        }
        return;
      }
      
      // Don't log ping/pong events to reduce noise
      if (event !== 'ping' && event !== 'pong') {
        console.log(`[Frontend->Backend] ${nsName} Event: ${event}`, {
          args: eventArgs,
          clientId: clientSocket.id,
          backendConnected: backendConnected
        });
      }
      
      if (backendConnected) {
        try {
          // Handle ACK callbacks
          const lastArg = eventArgs[eventArgs.length - 1];
          if (typeof lastArg === 'function') {
            const ackCallback = eventArgs.pop();
            backendSocket.emit(event, ...eventArgs, (...responseArgs) => {
              try {
                ackCallback(...responseArgs);
              } catch (e) {
                console.warn(`[Frontend->Backend] ACK error for event '${event}' in ${nsName}:`, e);
              }
            });
          } else {
            backendSocket.emit(event, ...eventArgs);
          }
        } catch (e) {
          console.warn(`[Frontend->Backend] Error forwarding event '${event}' in ${nsName}:`, e);
        }
      } else {
        console.log(`[Frontend->Backend] Backend not connected for ${nsName}, skipping event: ${event}`);
      }
    }
    
    if (originalClientOnevent) {
      originalClientOnevent.call(this, packet);
    }
  };

  // Store the backend socket for this namespace
  const socketKey = `${clientSocket.id}-${nsName}`;
  backendSockets.set(socketKey, backendSocket);

  // Clean up on frontend namespace disconnect
  clientSocket.on("disconnect", (reason) => {
    console.log(`\n📤 [Frontend] NAMESPACE DISCONNECTED:`, {
      socketId: clientSocket.id,
      namespace: nsName,
      reason: reason
    });
    
    try { 
      if (backendSocket.connected) {
        backendSocket.disconnect(); 
      }
    } catch (e) {}
    backendSockets.delete(socketKey);
  });

  return backendSocket;
}

// Handle connections to the default namespace
io.on("connection", (clientSocket) => {
  console.log(`\n======= [Proxy] DEFAULT NAMESPACE CONNECTION =======`);
  console.log(`[Proxy] Frontend connected to default namespace:`, clientSocket.id);
  
  // Create backend connection for default namespace
  createBackendSocket(clientSocket, clientSocket.nsp);
});

// Handle connections to custom namespaces
io.of(/.*/).on("connection", (clientSocket) => {
  const namespace = clientSocket.nsp;
  const nsName = namespace.name;
  
  // Skip the default namespace as it's handled above
  if (nsName === "/") return;
  
  console.log(`\n======= [Proxy] CUSTOM NAMESPACE CONNECTION =======`);
  console.log(`[Proxy] Frontend connected to custom namespace:`, {
    socketId: clientSocket.id,
    namespace: nsName
  });
  
  // Create backend connection for this custom namespace
  createBackendSocket(clientSocket, namespace);
});

// Log all available namespaces periodically
setInterval(() => {
  const namespaces = io._nsps ? Object.keys(io._nsps) : [];
  console.log(`\n[NamespaceMonitor] Active namespaces:`, namespaces);
  console.log(`[ConnectionMonitor] Active backend sockets: ${backendSockets.size}`);
}, 30000);

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Proxy] SIGTERM received, shutting down gracefully");
  console.log(`[Proxy] Active connections to close: ${backendSockets.size}`);
  
  backendSockets.forEach((backendSocket, key) => {
    try {
      console.log(`[Proxy] Disconnecting backend socket: ${key}`);
      backendSocket.disconnect();
    } catch (e) {}
  });
  
  server.close(() => {
    console.log("[Proxy] Server closed");
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎯 [Proxy] Socket.IO proxy listening on port ${PORT}`);
  console.log(`🎯 [Proxy] Forwarding to target: ${TARGET}`);
  console.log(`🎯 [Proxy] Fixed origin: ${FIXED_ORIGIN}`);
  console.log(`🎯 [Proxy] Fixed host: ${FIXED_HOST}`);
  console.log(`🎯 [Proxy] Ready for namespace connections...\n`);
});

// Log unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Proxy] Unhandled Rejection:", reason);
});

// Log uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("[Proxy] Uncaught Exception:", error);
  process.exit(1);
});

