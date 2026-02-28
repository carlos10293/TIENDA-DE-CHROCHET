import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, query, 
  doc, deleteDoc, serverTimestamp, updateDoc, getDoc
} from 'firebase/firestore';
import { 
  getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken 
} from 'firebase/auth';
import { 
  ShoppingBag, Plus, Trash2, X, CreditCard, 
  ShieldCheck, Edit3, Package, Search, 
  CheckCircle2, LogOut, Lock, ChevronLeft,
  Image as ImageIcon, ArrowRight, UploadCloud
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = JSON.parse(__firebase_config);
if (firebaseConfig) {
  firebaseConfig.projectId = "frida-s-6a626";
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'frida-s-6a626-v1';

const CATEGORIES = ["Todos", "Vestidos", "Tops", "Accesorios", "Exclusivos"];
const ADMIN_PIN = "2024";

export default function App() {
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('home'); 
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [loginPin, setLoginPin] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '', price: '', category: 'Vestidos', image: '', stock: 5, description: ''
  });

  // --- AUTHENTICATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Auth Fail", e); }
    };
    initAuth();

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      const savedAdmin = sessionStorage.getItem('fridaAdmin');
      if (savedAdmin === 'true') setIsAdmin(true);
    });

    return () => unsubAuth();
  }, []);

  // --- FIRESTORE DATA SYNC ---
  useEffect(() => {
    if (!user) return;

    const qProd = query(collection(db, 'artifacts', appId, 'public', 'data', 'products'));
    const unsubProd = onSnapshot(qProd, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoading(false);
    }, (err) => {
      console.error("Firestore Error:", err);
      setLoading(false);
    });

    const qOrders = query(collection(db, 'artifacts', appId, 'public', 'data', 'orders'));
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    }, (err) => console.log("Error órdenes", err));

    return () => { unsubProd(); unsubOrders(); };
  }, [user]);

  // Carrito persistente
  useEffect(() => {
    const saved = localStorage.getItem(`cart_${appId}`);
    if (saved) setCart(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(`cart_${appId}`, JSON.stringify(cart));
  }, [cart]);

  // --- HANDLERS ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (loginPin === ADMIN_PIN) {
      setIsAdmin(true);
      sessionStorage.setItem('fridaAdmin', 'true');
      setView('admin');
      setLoginPin('');
    } else {
      alert("PIN de acceso incorrecto");
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('fridaAdmin');
    setView('home');
  };

  const addToCart = (p) => {
    if (p.stock <= 0) return;
    const exists = cart.find(i => i.id === p.id);
    if (exists) {
      setCart(cart.map(i => i.id === p.id ? {...i, qty: i.qty + 1} : i));
    } else {
      setCart([...cart, {...p, qty: 1}]);
    }
    setView('cart');
  };

  const saveProduct = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.image) return alert("Por favor sube una imagen");
    
    setIsProcessing(true);
    try {
      const data = {
        ...formData,
        price: Number(formData.price),
        stock: Number(formData.stock),
        updatedAt: serverTimestamp()
      };
      
      const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'products');
      
      if (editingProduct) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', editingProduct.id), data);
      } else {
        await addDoc(collRef, { ...data, createdAt: serverTimestamp() });
      }
      setShowProductModal(false);
      setEditingProduct(null);
      setFormData({ name: '', price: '', category: 'Vestidos', image: '', stock: 5, description: '' });
    } catch (e) { 
      console.error(e);
      alert("Error al guardar. Verifica el tamaño de la imagen.");
    } finally { setIsProcessing(false); }
  };

  const deleteProduct = async (id) => {
    if (!user) return;
    if (window.confirm("¿Eliminar permanentemente esta pieza?")) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id));
    }
  };

  const processOrder = async () => {
    if (!user || cart.length === 0) return;
    setIsProcessing(true);
    try {
      const total = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
      const orderData = {
        items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
        total,
        status: 'Pagado',
        createdAt: serverTimestamp(),
        orderId: Math.random().toString(36).substr(2, 6).toUpperCase(),
        customerUid: user.uid
      };
      
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderData);
      
      for (const item of cart) {
        const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', item.id);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const currentStock = pSnap.data().stock || 0;
          await updateDoc(pRef, { stock: Math.max(0, currentStock - item.qty) });
        }
      }

      setCart([]);
      setView('success');
    } catch (e) { console.error(e); }
    finally { setIsProcessing(false); }
  };

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchCat = activeCategory === 'Todos' || p.category === activeCategory;
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, searchQuery]);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white text-black">
      <div className="w-8 h-8 border-2 border-zinc-200 border-t-black rounded-full animate-spin mb-4"></div>
      <p className="font-serif italic tracking-widest opacity-40 uppercase text-[10px]">Iniciando Atelier...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] font-sans selection:bg-black selection:text-white">
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-[80] bg-white/95 backdrop-blur-sm border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => isAdmin ? setView('admin') : setView('login')} 
              className={`p-2 transition-all ${isAdmin ? 'text-black' : 'text-zinc-300 hover:text-black'}`}
            >
              <Lock size={18} />
            </button>
            <h1 onClick={() => setView('home')} className="font-serif text-2xl italic tracking-tighter cursor-pointer">Frida Sofia</h1>
          </div>

          <div className="flex items-center gap-8">
            <button onClick={() => setView('shop')} className="hidden md:block text-[9px] uppercase tracking-[0.4em] font-black">Shop</button>
            <button onClick={() => setView('cart')} className="relative">
              <ShoppingBag size={22} strokeWidth={1.5} />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-black text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">
                  {cart.length}
                </span>
              )}
            </button>
            {isAdmin && (
              <button onClick={handleLogout} className="text-zinc-300 hover:text-red-500">
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-20">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="animate-in fade-in duration-700">
            <section className="relative h-[90vh] flex items-center justify-center overflow-hidden bg-zinc-900">
              <img src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=2000&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover opacity-60 scale-105" />
              <div className="relative z-10 text-center space-y-8 px-6">
                <span className="text-[10px] uppercase tracking-[0.8em] text-white/70 block">Boutique de Alta Costura</span>
                <h2 className="text-6xl md:text-9xl font-serif italic text-white tracking-tighter leading-none">Nueva<br/>Colección</h2>
                <button onClick={() => setView('shop')} className="bg-white text-black px-12 py-5 text-[10px] uppercase tracking-[0.5em] font-black hover:bg-black hover:text-white transition-all shadow-2xl">
                  Explorar Catálogo
                </button>
              </div>
            </section>
          </div>
        )}

        {/* VIEW: SHOP */}
        {view === 'shop' && (
          <div className="max-w-7xl mx-auto px-6 py-16">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-8">
              <div className="space-y-6">
                <h2 className="text-5xl font-serif italic tracking-tighter">Boutique</h2>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setActiveCategory(c)} className={`px-5 py-2 text-[9px] uppercase tracking-widest font-black transition-all border ${activeCategory === c ? 'bg-black text-white border-black' : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-300'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative w-full md:w-64 border-b border-zinc-200 focus-within:border-black transition-colors">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-300" size={16} />
                <input 
                  type="text" 
                  placeholder="BUSCAR..." 
                  className="w-full pl-8 pr-4 py-3 bg-transparent outline-none text-[10px] tracking-widest uppercase"
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-16">
              {filtered.map(p => (
                <div key={p.id} className="group">
                  <div className="aspect-[3/4] bg-zinc-100 overflow-hidden relative mb-6">
                    <img src={p.image} className={`w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110 ${p.stock <= 0 ? 'opacity-40' : ''}`} />
                    {p.stock > 0 ? (
                      <div className="absolute inset-0 flex items-end opacity-0 group-hover:opacity-100 transition-all p-4 bg-black/5">
                        <button onClick={() => addToCart(p)} className="w-full bg-white text-black py-4 text-[9px] font-black uppercase tracking-widest shadow-xl hover:bg-black hover:text-white transition-colors">
                          Añadir a la Bolsa
                        </button>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-black text-white px-3 py-1 text-[8px] uppercase tracking-widest font-bold">Agotado</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-baseline">
                      <h4 className="font-serif text-xl italic tracking-tighter">{p.name}</h4>
                      <span className="text-sm font-light text-zinc-400">${p.price.toLocaleString()}</span>
                    </div>
                    <p className="text-[8px] uppercase tracking-widest text-zinc-300 font-black">{p.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: LOGIN ADMIN */}
        {view === 'login' && (
          <div className="h-[70vh] flex items-center justify-center px-6">
            <div className="max-w-sm w-full bg-white p-12 border border-zinc-100 shadow-sm">
              <div className="text-center space-y-4 mb-10">
                <h2 className="font-serif text-4xl italic tracking-tighter">Acceso Admin</h2>
                <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-300">Introduce el PIN de acceso</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-6">
                <input 
                  type="password" 
                  className="w-full bg-zinc-50 border border-zinc-100 p-4 outline-none focus:border-black transition-all text-center tracking-[1em] text-lg"
                  value={loginPin}
                  onChange={e => setLoginPin(e.target.value)}
                  autoFocus
                  required
                />
                <button type="submit" className="w-full bg-black text-white py-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3">
                  Confirmar <ArrowRight size={14} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* VIEW: ADMIN PANEL */}
        {view === 'admin' && isAdmin && (
          <div className="max-w-7xl mx-auto px-6 py-12 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-16">
              <div>
                <h2 className="text-4xl font-serif italic tracking-tighter">Panel de Gestión</h2>
                <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold">Bienvenida, Frida</p>
              </div>
              <button 
                onClick={() => { setEditingProduct(null); setFormData({name:'', price:'', category:'Vestidos', image:'', stock:5, description:''}); setShowProductModal(true); }}
                className="bg-black text-white px-8 py-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-lg hover:bg-zinc-800 transition-all"
              >
                <Plus size={18} /> Nueva Pieza
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {products.map(p => (
                    <div key={p.id} className="bg-white p-4 flex gap-4 items-center border border-zinc-100">
                      <img src={p.image} className="w-16 h-20 object-cover bg-zinc-50" />
                      <div className="flex-grow min-w-0">
                        <p className="font-serif text-lg italic tracking-tighter truncate">{p.name}</p>
                        <p className="text-[8px] uppercase font-black text-zinc-300 mt-1">${p.price} • Stock: {p.stock}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => { setEditingProduct(p); setFormData(p); setShowProductModal(true); }} className="p-2 text-zinc-300 hover:text-black"><Edit3 size={16}/></button>
                        <button onClick={() => deleteProduct(p.id)} className="p-2 text-zinc-300 hover:text-red-500"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Ventas Recientes</h3>
                <div className="space-y-3">
                  {orders.map(order => (
                    <div key={order.id} className="p-5 bg-white border border-zinc-100">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[8px] font-black uppercase tracking-tighter text-zinc-300">ID: {order.orderId}</span>
                        <span className="text-[8px] bg-zinc-50 text-zinc-800 px-2 py-0.5 uppercase font-bold">Completado</span>
                      </div>
                      <div className="flex justify-between items-end">
                        <p className="font-bold text-lg tracking-tighter">${order.total?.toLocaleString()}</p>
                        <p className="text-[8px] text-zinc-300 uppercase">{new Date(order.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: CART */}
        {view === 'cart' && (
          <div className="max-w-4xl mx-auto px-6 py-16 animate-in slide-in-from-bottom-5">
            <h2 className="text-5xl font-serif italic tracking-tighter mb-12">Bolsa</h2>
            {cart.length === 0 ? (
              <div className="text-center py-20 border-y border-zinc-50">
                <p className="text-zinc-300 italic font-serif text-xl mb-8">No has seleccionado piezas aún.</p>
                <button onClick={() => setView('shop')} className="text-[10px] uppercase font-black tracking-widest border-b border-black pb-1">Ver Catálogo</button>
              </div>
            ) : (
              <div className="space-y-8">
                {cart.map(item => (
                  <div key={item.id} className="flex gap-6 items-center border-b border-zinc-50 pb-8">
                    <img src={item.image} className="w-20 h-28 object-cover bg-zinc-50" />
                    <div className="flex-grow">
                      <div className="flex justify-between mb-1">
                        <h4 className="font-serif text-xl italic tracking-tighter">{item.name}</h4>
                        <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-zinc-300"><X size={18}/></button>
                      </div>
                      <p className="text-[8px] uppercase tracking-widest text-zinc-300 font-black mb-4">{item.category}</p>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center border border-zinc-100">
                          <button onClick={() => setCart(cart.map(i => i.id === item.id ? {...i, qty: Math.max(1, i.qty - 1)} : i))} className="px-3 py-1 text-xs">-</button>
                          <span className="px-4 py-1 text-[10px] font-black border-x border-zinc-50">{item.qty}</span>
                          <button onClick={() => setCart(cart.map(i => i.id === item.id ? {...i, qty: i.qty + 1} : i))} className="px-3 py-1 text-xs">+</button>
                        </div>
                        <span className="font-serif text-xl italic">${(item.price * item.qty).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-8 space-y-6">
                  <div className="flex justify-between font-serif text-4xl italic tracking-tighter">
                    <span>Total</span>
                    <span>${cart.reduce((acc, i) => acc + (i.price * i.qty), 0).toLocaleString()}</span>
                  </div>
                  <button 
                    onClick={processOrder}
                    disabled={isProcessing}
                    className="w-full bg-black text-white py-5 text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3"
                  >
                    {isProcessing ? 'Procesando...' : 'Pagar Ahora'} <CreditCard size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: SUCCESS */}
        {view === 'success' && (
          <div className="h-[70vh] flex flex-col items-center justify-center text-center px-6">
            <CheckCircle2 size={60} strokeWidth={1} className="text-zinc-200 mb-8" />
            <h2 className="text-5xl font-serif italic tracking-tighter mb-4">Pedido Recibido</h2>
            <p className="text-zinc-400 text-sm max-w-xs mb-10 leading-relaxed">Tu selección ha sido procesada correctamente por nuestro Atelier.</p>
            <button onClick={() => setView('shop')} className="bg-black text-white px-10 py-4 text-[9px] uppercase tracking-widest font-black">
              Seguir Comprando
            </button>
          </div>
        )}

      </main>

      {/* MODAL: SUBIR / EDITAR PRODUCTO (DESDE LA PÁGINA) */}
      {showProductModal && isAdmin && (
        <div className="fixed inset-0 z-[100] bg-white overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-20 relative">
            <button onClick={() => setShowProductModal(false)} className="absolute top-8 right-6 text-zinc-300 hover:text-black">
              <X size={32} strokeWidth={1.5} />
            </button>
            <h3 className="font-serif text-4xl italic tracking-tighter mb-16 text-center">
              {editingProduct ? 'Editar Pieza' : 'Subir Nueva Pieza'}
            </h3>
            
            <form onSubmit={saveProduct} className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
              {/* ÁREA DE CARGA DE IMAGEN */}
              <div 
                className="aspect-[3/4] bg-zinc-50 border border-zinc-100 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group hover:border-black transition-all"
                onClick={() => document.getElementById('imgIn').click()}
              >
                {formData.image ? (
                  <>
                    <img src={formData.image} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <UploadCloud size={32} className="text-white" />
                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-4 p-8">
                    <UploadCloud size={40} strokeWidth={1} className="text-zinc-200 mx-auto" />
                    <p className="text-[9px] uppercase font-black tracking-widest text-zinc-300">Seleccionar fotografía</p>
                  </div>
                )}
                <input id="imgIn" type="file" className="hidden" accept="image/*" onChange={e => {
                  const f = e.target.files[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = (ev) => setFormData({...formData, image: ev.target.result});
                  r.readAsDataURL(f);
                }} />
              </div>

              {/* CAMPOS DE TEXTO */}
              <div className="space-y-8">
                <div className="space-y-2">
                  <label className="text-[9px] uppercase font-black tracking-widest text-zinc-300">Nombre de la Pieza</label>
                  <input 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full border-b border-zinc-100 py-3 outline-none focus:border-black font-serif text-2xl italic bg-transparent" 
                    placeholder="Ej. Vestido Gala Seda" required 
                  />
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-black tracking-widest text-zinc-300">Precio</label>
                    <input type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full border-b border-zinc-100 py-3 outline-none focus:border-black font-bold" required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-black tracking-widest text-zinc-300">Stock</label>
                    <input type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} className="w-full border-b border-zinc-100 py-3 outline-none focus:border-black font-bold" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] uppercase font-black tracking-widest text-zinc-300">Categoría</label>
                  <select 
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full border-b border-zinc-100 py-3 outline-none focus:border-black text-[10px] uppercase font-black bg-transparent"
                  >
                    {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] uppercase font-black tracking-widest text-zinc-300">Descripción</label>
                  <textarea 
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="w-full border-b border-zinc-100 py-3 outline-none focus:border-black text-xs leading-relaxed bg-transparent resize-none"
                    placeholder="Detalles sobre el diseño y materiales..."
                  ></textarea>
                </div>
                <button disabled={isProcessing} className="w-full bg-black text-white py-5 text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-zinc-800 transition-all">
                  {isProcessing ? 'Subiendo...' : 'Publicar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="py-20 border-t border-zinc-50 text-center">
        <p className="font-serif italic text-2xl opacity-10 mb-6">Frida Sofia Boutique</p>
        <p className="text-[8px] uppercase tracking-[0.3em] text-zinc-300 font-bold">&copy; 2024 Todos los derechos reservados</p>
      </footer>

    </div>
  );
}

