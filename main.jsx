import React, { useState, useRef, useEffect } from 'react';
import { 
  ShoppingCart, Star, X, ShoppingBag, 
  Plus, Trash2, Search, Sparkles, 
  Check, Clock, Copy, MapPin, Truck,
  Lock, LayoutDashboard, Database, Edit3,
  Package, TrendingUp, PlusCircle, ArrowLeft,
  DollarSign, User, Upload, ImageIcon, Store,
  MessageSquare, AlertCircle, Send, Bell, Phone,
  CreditCard, ChevronRight, Home
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONFIGURAÇÃO FIREBASE ---
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore"; // Já deixei o banco de dados preparado!

const firebaseConfig = {
  apiKey: "AIzaSyAYGUmvBmUpWQzextx3AaO9mxUhdveu6EA",
  authDomain: "lojinha-da-chelly.firebaseapp.com",
  projectId: "lojinha-da-chelly",
  storageBucket: "lojinha-da-chelly.firebasestorage.app",
  messagingSenderId: "252536959525",
  appId: "1:252536959525:web:60347c6dfef601bacac5cc",
  measurementId: "G-4PVZZFRXND"
};

// Inicializando Firebase, Analytics e Firestore
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const db = getFirestore(app); 


// --- GERADOR DE PAYLOAD PIX ---
const generatePixPayload = (chave, valor, nomeLoja, cidade) => {
  const cleanChave = chave.replace(/\D/g, '');
  const cleanValor = parseFloat(valor).toFixed(2);
  const f = (id, val) => id + String(val.length).padStart(2, '0') + val;
  const payloadFormat = f('00', '01');
  const merchantAccount = f('26', f('00', 'br.gov.bcb.pix') + f('01', cleanChave));
  const merchantCategory = f('52', '0000');
  const currency = f('53', '986');
  const amount = f('54', cleanValor);
  const country = f('58', 'BR');
  const merchantName = f('59', nomeLoja.substring(0, 25));
  const merchantCity = f('60', cidade.substring(0, 15));
  const additionalData = f('62', f('05', '***'));
  let payload = payloadFormat + merchantAccount + merchantCategory + currency + amount + country + merchantName + merchantCity + additionalData + '6304';
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
    }
  }
  return payload + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};

const QRCodeNative = ({ text, size = 200 }) => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=10`;
  return (
    <div className="relative flex items-center justify-center bg-white p-3 rounded-3xl shadow-inner border border-blue-50">
      <img src={qrUrl} alt="QR Code Pix" style={{ width: size, height: size }} className="rounded-xl" />
    </div>
  );
};

const App = () => {
  const MINHA_CHAVE_PIX = "06515285426"; 
  const ADMIN_PASSWORD = "MATport123";
  const fileInputRef = useRef(null);

  // --- ESTADOS ---
  const [view, setView] = useState('shop'); 
  const [activeTab, setActiveTab] = useState('todos');
  const [showCart, setShowCart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState('');
  const [adminSubSection, setAdminSubSection] = useState('produtos'); 
  const [checkoutStep, setCheckoutStep] = useState('cart'); // cart, address, pix
  
  // Endereço do Cliente
  const [address, setAddress] = useState({
    rua: '',
    numero: '',
    bairro: '',
    cidade: ''
  });

  // Estados do Modal "Me Avise"
  const [showMeAviseModal, setShowMeAviseModal] = useState(false);
  const [meAviseProduct, setMeAviseProduct] = useState(null);
  const [meAviseForm, setMeAviseForm] = useState({ nome: '', whatsapp: '' });

  // --- BANCO DE DADOS (Local por enquanto) ---
  const [products, setProducts] = useState([
    { 
        id: 1, name: "Perfume Noite Estelar", price: 349.90, category: "perfumes", 
        rating: 4.9, stock: 5, image: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&q=80&w=400",
        comments: [
            { id: 101, user: "Ana Paula", text: "Maravilhoso, fixação incrível!", stars: 5, date: "12/05/2023" },
            { id: 102, user: "Carla S.", text: "Cheiro muito sofisticado.", stars: 4, date: "15/06/2023" }
        ]
    },
    { 
        id: 2, name: "Sérum Hyaluronic Blue", price: 89.00, category: "skincare", 
        rating: 4.8, stock: 0, image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400",
        comments: []
    }
  ]);

  const [demands, setDemands] = useState([]); 
  const [newProd, setNewProd] = useState({ name: '', price: '', category: 'make', image: '', stock: 10 });
  const [newComment, setNewComment] = useState({ text: '', stars: 5, user: '' });

  // --- LÓGICA ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewProd({ ...newProd, image: reader.result });
      reader.readAsDataURL(file);
    }
  };

  const handleAddProduct = () => {
    if (!newProd.name || !newProd.price || !newProd.image) {
        alert("Preencha todos os campos!");
        return;
    }
    const productToAdd = {
        ...newProd,
        id: Date.now(),
        price: parseFloat(newProd.price),
        stock: parseInt(newProd.stock),
        rating: 5.0,
        comments: []
    };
    setProducts([...products, productToAdd]);
    setNewProd({ name: '', price: '', category: 'make', image: '', stock: 10 });
  };

  const addToCart = (product) => {
    if (product.stock <= 0) return;
    setCart([...cart, { ...product, cartId: Date.now() }]);
  };

  const removeFromCart = (cartId) => {
    setCart(cart.filter(item => item.cartId !== cartId));
  };

  const openMeAvise = (product) => {
    setMeAviseProduct(product);
    setShowMeAviseModal(true);
  };

  const submitMeAvise = (e) => {
    e.preventDefault();
    const newDemand = { 
        id: Date.now(), 
        product: meAviseProduct.name, 
        user: meAviseForm.nome, 
        whatsapp: meAviseForm.whatsapp,
        date: new Date().toLocaleDateString('pt-BR')
    };
    setDemands(prev => [newDemand, ...prev]);
    setShowMeAviseModal(false);
    setMeAviseForm({ nome: '', whatsapp: '' });
    alert("Solicitação registrada!");
  };

  const submitComment = (prodId) => {
    if (!newComment.text || !newComment.user) return;
    const commentToAdd = {
        ...newComment,
        id: Date.now(),
        date: new Date().toLocaleDateString('pt-BR')
    };
    setProducts(products.map(p => {
        if (p.id === prodId) {
            const updatedComments = [...p.comments, commentToAdd];
            const avgRating = updatedComments.reduce((acc, c) => acc + c.stars, 0) / updatedComments.length;
            return { ...p, comments: updatedComments, rating: parseFloat(avgRating.toFixed(1)) };
        }
        return p;
    }));
    setNewComment({ text: '', stars: 5, user: '' });
  };

  const cartTotal = cart.reduce((acc, curr) => acc + curr.price, 0);
  const filteredProducts = products.filter(p => activeTab === 'todos' || p.category === activeTab);
  const pixPayload = generatePixPayload(MINHA_CHAVE_PIX, cartTotal, "Chelly Shop", "Sao Paulo");

  return (
    <div className="min-h-screen bg-[#fafbff] font-sans text-slate-900 selection:bg-rose-200">
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-[100] bg-white/80 backdrop-blur-xl border-b border-rose-100/30 h-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('shop')}>
            <div className="w-11 h-11 bg-gradient-to-br from-rose-400 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Store size={24} />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-2xl font-black uppercase italic tracking-tighter bg-gradient-to-r from-rose-500 to-blue-600 bg-clip-text text-transparent">
                Chelly Shop
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => view === 'admin' ? setView('shop') : setShowAdminLogin(true)} 
              className={`p-3 rounded-2xl flex items-center gap-2 transition-all ${view === 'admin' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
            >
              <Lock size={18} />
            </button>
            <button onClick={() => setShowCart(true)} className="relative p-3 bg-white rounded-2xl text-blue-600 border border-blue-50 shadow-sm transition-transform active:scale-95 group">
              <ShoppingCart size={22} />
              {cart.length > 0 && <span className="absolute -top-1 -right-1 w-6 h-6 bg-rose-500 text-white text-[10px] rounded-full flex items-center justify-center border-2 border-white font-black group-hover:scale-110 transition-transform">{cart.length}</span>}
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-12 px-6 max-w-7xl mx-auto">
        {view === 'shop' ? (
          <div className="space-y-12">
            {/* FILTROS */}
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {['todos', 'perfumes', 'skincare', 'make'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase border transition-all shrink-0 ${activeTab === tab ? 'bg-rose-500 text-white border-transparent shadow-lg' : 'bg-white text-slate-400 border-slate-100'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* LISTA PRODUTOS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredProducts.map(product => (
                <div key={product.id} className="bg-white rounded-[3rem] border border-blue-50 overflow-hidden shadow-sm hover:shadow-xl transition-all group flex flex-col">
                  <div className="aspect-[4/5] relative overflow-hidden bg-slate-50 cursor-pointer" onClick={() => setSelectedProduct(product)}>
                    <img src={product.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                    {product.stock <= 0 && (
                        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-6 text-center">
                            <span className="text-white font-black uppercase italic text-sm leading-tight">Esgotado! <br/><span className="text-[10px] text-rose-300 italic">Em breve mais unidades</span></span>
                        </div>
                    )}
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
                        <Star size={12} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-[10px] font-black text-slate-700">{product.rating}</span>
                    </div>
                  </div>
                  <div className="p-8 text-center flex-grow flex flex-col justify-between">
                    <div>
                        <h3 className="font-black text-slate-700 uppercase tracking-tighter text-lg leading-tight mb-2">{product.name}</h3>
                        <p className="text-2xl font-black text-blue-600 mb-6 italic">R$ {product.price.toFixed(2)}</p>
                    </div>
                    
                    {product.stock > 0 ? (
                        <button 
                            onClick={(e) => { e.stopPropagation(); addToCart(product); }} 
                            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 active:scale-95 transition-all"
                        >
                            Adicionar
                        </button>
                    ) : (
                        <button onClick={() => openMeAvise(product)} className="w-full bg-rose-100 text-rose-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-rose-200 hover:bg-rose-200 transition-colors">Me Avise</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* PAINEL ADMIN */
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                <div className="flex gap-4">
                    <button onClick={() => setAdminSubSection('produtos')} className={`px-6 py-3 rounded-xl font-black uppercase text-[10px] ${adminSubSection === 'produtos' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white border border-slate-100 text-slate-400'}`}>Produtos</button>
                    <button onClick={() => setAdminSubSection('demandas')} className={`px-6 py-3 rounded-xl font-black uppercase text-[10px] relative ${adminSubSection === 'demandas' ? 'bg-rose-500 text-white shadow-lg' : 'bg-white border border-slate-100 text-slate-400'}`}>
                        Solicitações
                        {demands.length > 0 && <span className="absolute -top-2 -right-2 bg-slate-900 text-white w-5 h-5 rounded-full flex items-center justify-center text-[8px]">{demands.length}</span>}
                    </button>
                </div>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">Painel de Controle</h2>
            </div>

            {adminSubSection === 'produtos' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-4 bg-white p-8 rounded-[3rem] shadow-sm border border-blue-50 h-fit">
                        <h3 className="font-black uppercase italic mb-6 text-slate-400 text-xs">Novo Item</h3>
                        <div className="space-y-4">
                            <input placeholder="Nome do Produto" className="input-style" value={newProd.name} onChange={e => setNewProd({...newProd, name: e.target.value})} />
                            <div className="grid grid-cols-2 gap-4">
                                <input placeholder="Preço" type="number" className="input-style" value={newProd.price} onChange={e => setNewProd({...newProd, price: e.target.value})} />
                                <input placeholder="Estoque" type="number" className="input-style" value={newProd.stock} onChange={e => setNewProd({...newProd, stock: e.target.value})} />
                            </div>
                            <select className="input-style" value={newProd.category} onChange={e => setNewProd({...newProd, category: e.target.value})}>
                                <option value="make">Maquiagem</option>
                                <option value="skincare">Skincare</option>
                                <option value="perfumes">Perfumes</option>
                            </select>
                            <div className="w-full aspect-video bg-slate-50 border-2 border-dashed rounded-3xl flex items-center justify-center cursor-pointer overflow-hidden group" onClick={() => fileInputRef.current.click()}>
                                {newProd.image ? <img src={newProd.image} className="w-full h-full object-cover" alt="preview" /> : <div className="text-center"><Upload className="text-slate-300 mx-auto mb-2" /><span className="text-[8px] font-black uppercase text-slate-300">Carregar Foto</span></div>}
                            </div>
                            <input type="file" ref={fileInputRef} hidden onChange={handleImageUpload} />
                            <button onClick={handleAddProduct} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase hover:bg-blue-600 transition-colors shadow-lg">Salvar Produto</button>
                        </div>
                    </div>
                    <div className="lg:col-span-8 bg-white rounded-[3rem] shadow-sm border border-blue-50 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b">
                                <tr className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                  <th className="p-6">Produto</th>
                                  <th>Nota</th>
                                  <th>Estoque</th>
                                  <th className="text-right p-6">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map(p => (
                                    <tr key={p.id} className="border-b hover:bg-slate-50/50 transition-colors">
                                        <td className="p-6 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl overflow-hidden shadow-sm">
                                                <img src={p.image} className="w-full h-full object-cover" alt="" />
                                            </div>
                                            <span className="font-bold text-xs text-slate-700">{p.name}</span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-1 font-black text-xs text-yellow-500">
                                                <Star size={14} className="fill-current" /> {p.rating}
                                            </div>
                                        </td>
                                        <td className="text-xs">
                                            <span className={`px-4 py-1.5 rounded-full font-black text-[9px] uppercase tracking-tighter ${p.stock <= 0 ? 'bg-rose-100 text-rose-500 border border-rose-200' : 'bg-green-100 text-green-600 border border-green-200'}`}>{p.stock} un.</span>
                                        </td>
                                        <td className="text-right p-6">
                                            <button onClick={() => setProducts(products.filter(item => item.id !== p.id))} className="text-rose-400 hover:text-rose-600 p-2 transition-colors"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {adminSubSection === 'demandas' && (
                <div className="bg-white rounded-[4rem] p-12 border border-blue-50 shadow-sm">
                    <h3 className="font-black italic uppercase text-2xl mb-2 flex items-center gap-3 tracking-tighter">
                      <Bell className="text-rose-500" size={24} /> Lista de Interesse
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-8">
                        {demands.length === 0 && <p className="col-span-full text-center text-slate-300 py-20 italic">Nenhuma solicitação no momento...</p>}
                        {demands.map(d => (
                            <div key={d.id} className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 relative">
                                <button onClick={() => setDemands(demands.filter(i => i.id !== d.id))} className="absolute top-6 right-6 text-rose-300 hover:text-rose-500"><Trash2 size={16} /></button>
                                <p className="text-[9px] font-black uppercase text-rose-500 mb-2 italic">Solicitado em {d.date}</p>
                                <h4 className="font-black text-lg text-slate-800 italic uppercase tracking-tighter mb-4">{d.product}</h4>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600"><User size={14} className="text-blue-400" /> {d.user}</div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600"><Phone size={14} className="text-green-500" /> {d.whatsapp}</div>
                                </div>
                                <a href={`https://wa.me/55${d.whatsapp.replace(/\D/g, '')}`} target="_blank" className="mt-6 w-full py-3 bg-green-500 text-white rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-colors shadow-lg shadow-green-100">Contactar Cliente</a>
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </div>
        )}
      </main>

      {/* SACOLA (SIDEBAR CART) */}
      <AnimatePresence>
        {showCart && (
          <div className="fixed inset-0 z-[250] overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => {setShowCart(false); setCheckoutStep('cart')}} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
              
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    {checkoutStep === 'cart' ? <ShoppingBag size={24} /> : checkoutStep === 'address' ? <MapPin size={24} /> : <CreditCard size={24} />}
                  </div>
                  <h3 className="font-black uppercase italic tracking-tighter text-xl">
                    {checkoutStep === 'cart' ? 'Sua Sacola' : checkoutStep === 'address' ? 'Entrega' : 'Pagamento'}
                  </h3>
                </div>
                <button onClick={() => {setShowCart(false); setCheckoutStep('cart')}} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"><X /></button>
              </div>

              <div className="flex-grow overflow-y-auto p-8 scrollbar-hide">
                {checkoutStep === 'cart' && (
                  <>
                    {cart.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                        <ShoppingCart size={60} strokeWidth={1} />
                        <p className="font-black uppercase italic text-xs tracking-[0.2em]">Sacola Vazia</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {cart.map((item) => (
                          <motion.div layout key={item.cartId} className="flex gap-4 group animate-in fade-in slide-in-from-right-4">
                            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 shrink-0">
                              <img src={item.image} className="w-full h-full object-cover" alt="" />
                            </div>
                            <div className="flex-grow">
                              <h4 className="font-black text-xs uppercase text-slate-700 italic">{item.name}</h4>
                              <p className="text-blue-600 font-black text-sm mt-1">R$ {item.price.toFixed(2)}</p>
                            </div>
                            <button onClick={() => removeFromCart(item.cartId)} className="text-slate-300 hover:text-rose-500 transition-colors p-2"><Trash2 size={16} /></button>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {checkoutStep === 'address' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="flex flex-col gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2 italic">Rua / Logradouro</label>
                        <input className="input-style" placeholder="Ex: Av. Brasil" value={address.rua} onChange={e => setAddress({...address, rua: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-2 italic">Número</label>
                          <input className="input-style" placeholder="Ex: 123" value={address.numero} onChange={e => setAddress({...address, numero: e.target.value})} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-2 italic">Bairro</label>
                          <input className="input-style" placeholder="Ex: Centro" value={address.bairro} onChange={e => setAddress({...address, bairro: e.target.value})} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2 italic">Cidade</label>
                        <input className="input-style" placeholder="Ex: São Paulo" value={address.cidade} onChange={e => setAddress({...address, cidade: e.target.value})} />
                      </div>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-start gap-4">
                      <Truck className="text-blue-500 shrink-0" size={20} />
                      <p className="text-[10px] font-bold text-slate-500 leading-relaxed italic">Certifique-se de que o endereço está correto para que seu brilho chegue sem atrasos!</p>
                    </div>
                  </div>
                )}

                {checkoutStep === 'pix' && (
                  <div className="space-y-8 py-4 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-blue-50 p-6 rounded-[2.5rem] border border-blue-100 text-center">
                      <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest mb-4">Total a pagar</p>
                      <h2 className="text-4xl font-black italic text-blue-700 tracking-tighter">R$ {cartTotal.toFixed(2)}</h2>
                    </div>
                    
                    <div className="flex flex-col items-center gap-6">
                      <QRCodeNative text={pixPayload} size={220} />
                      <div className="bg-slate-50 p-4 rounded-2xl w-full border border-slate-100">
                        <p className="text-[9px] font-black uppercase text-slate-400 mb-2 text-center">Chave Pix (Celular)</p>
                        <div className="flex items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200">
                          <span className="text-xs font-bold text-slate-600 truncate">{MINHA_CHAVE_PIX}</span>
                          <button onClick={() => {navigator.clipboard.writeText(MINHA_CHAVE_PIX); alert("Chave copiada!")}} className="text-blue-600 hover:scale-110 transition-transform"><Copy size={16} /></button>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 bg-yellow-50 rounded-2xl border border-yellow-100">
                        <Clock className="text-yellow-600 shrink-0 mt-0.5" size={16} />
                        <p className="text-[10px] font-bold text-yellow-700 leading-relaxed italic">Após o pagamento, envie o comprovante pelo WhatsApp para agilizarmos seu pedido!</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-8 bg-slate-50 rounded-t-[3rem] space-y-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
                  {checkoutStep === 'cart' ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-black text-[10px] uppercase text-slate-400 italic">Subtotal</span>
                        <span className="font-black text-xl italic text-slate-800">R$ {cartTotal.toFixed(2)}</span>
                      </div>
                      <button 
                        onClick={() => setCheckoutStep('address')} 
                        className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-3"
                      >
                        Próximo Passo <ChevronRight size={18} />
                      </button>
                    </>
                  ) : checkoutStep === 'address' ? (
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={() => {
                          if(!address.rua || !address.numero || !address.cidade) {
                            alert("Por favor, preencha o endereço completo!");
                            return;
                          }
                          setCheckoutStep('pix');
                        }} 
                        className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-3"
                      >
                        Ir para o Pagamento <ChevronRight size={18} />
                      </button>
                      <button onClick={() => setCheckoutStep('cart')} className="w-full text-[10px] font-black uppercase text-slate-400 py-2 hover:text-slate-600 transition-colors">
                        Voltar para Sacola
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setCheckoutStep('address')} className="w-full bg-white border border-slate-200 text-slate-400 py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all">
                      Voltar ao Endereço
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DETALHES + COMENTÁRIOS */}
      <AnimatePresence>
        {selectedProduct && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-10">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/90 backdrop-blur-md" onClick={() => setSelectedProduct(null)} />
                <motion.div initial={{ scale: 0.9, opacity: 0, y: 50 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 50 }} className="relative bg-white w-full max-w-6xl h-full md:h-[85vh] rounded-[3rem] md:rounded-[5rem] overflow-hidden flex flex-col md:flex-row shadow-2xl">
                    <button onClick={() => setSelectedProduct(null)} className="absolute top-8 right-8 z-10 w-12 h-12 bg-white/20 backdrop-blur-xl text-white md:text-slate-400 md:bg-slate-50 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"><X /></button>
                    
                    <div className="w-full md:w-1/2 h-60 sm:h-80 md:h-full bg-slate-100 relative">
                        <img src={selectedProduct.image} className="w-full h-full object-cover" alt="" />
                        <div className="absolute bottom-8 left-8 bg-white/90 backdrop-blur-xl p-6 rounded-[2.5rem] shadow-xl border border-white/50 hidden sm:block">
                            <div className="flex items-center gap-1 mb-1">
                                {[1,2,3,4,5].map(s => <Star key={s} size={16} className={s <= Math.round(selectedProduct.rating) ? "fill-yellow-400 text-yellow-400" : "text-slate-200"} />)}
                            </div>
                            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest italic">{selectedProduct.comments.length} Avaliações de clientes</p>
                        </div>
                    </div>

                    <div className="w-full md:w-1/2 p-8 md:p-16 overflow-y-auto bg-white flex flex-col">
                        <div className="mb-10">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500 mb-4 block italic">{selectedProduct.category}</span>
                            <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-slate-800 leading-none mb-6">{selectedProduct.name}</h2>
                            <p className="text-4xl font-black text-rose-500 mb-8 italic">R$ {selectedProduct.price.toFixed(2)}</p>
                            
                            {selectedProduct.stock > 0 ? (
                                <button 
                                    onClick={() => { addToCart(selectedProduct); setSelectedProduct(null); }} 
                                    className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-3"
                                >
                                    Adicionar à Sacola <Plus />
                                </button>
                            ) : (
                                <button onClick={() => openMeAvise(selectedProduct)} className="w-full bg-rose-500 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl hover:bg-slate-900 transition-all">Me Avise quando chegar</button>
                            )}
                        </div>

                        {/* SEÇÃO COMENTÁRIOS */}
                        <div className="mt-auto pt-10 border-t border-slate-50">
                            <h3 className="font-black uppercase italic text-lg mb-8 tracking-tighter flex items-center gap-2">Feedbacks <MessageSquare size={18} className="text-blue-500" /></h3>
                            
                            {/* Novo Comentário */}
                            <div className="bg-slate-50 p-6 rounded-[2.5rem] mb-8 border border-slate-100">
                                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                                    <input placeholder="Seu Nome" className="input-style flex-1 !py-3" value={newComment.user} onChange={e => setNewComment({...newComment, user: e.target.value})} />
                                    <div className="flex items-center gap-2 px-4 bg-white rounded-2xl border border-slate-200 h-[3.5rem] sm:h-auto">
                                        <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                        <select className="bg-transparent font-black text-xs outline-none" value={newComment.stars} onChange={e => setNewComment({...newComment, stars: parseInt(e.target.value)})}>
                                            <option value="5">5 estrelas</option>
                                            <option value="4">4 estrelas</option>
                                            <option value="3">3 estrelas</option>
                                            <option value="2">2 estrelas</option>
                                            <option value="1">1 estrela</option>
                                        </select>
                                    </div>
                                </div>
                                <textarea placeholder="O que achou deste produto?" className="input-style !h-24 resize-none mb-4" value={newComment.text} onChange={e => setNewComment({...newComment, text: e.target.value})}></textarea>
                                <button onClick={() => submitComment(selectedProduct.id)} className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black text-[9px] uppercase tracking-[0.2em] shadow-lg shadow-blue-100 hover:bg-slate-900 transition-all">Publicar Avaliação</button>
                            </div>

                            <div className="space-y-6">
                                {selectedProduct.comments.length === 0 && <p className="text-center text-slate-300 text-xs italic">Seja o primeiro a avaliar!</p>}
                                {selectedProduct.comments.map(c => (
                                    <div key={c.id} className="border-b border-slate-50 pb-6 last:border-0">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-black text-xs uppercase text-slate-700 italic">{c.user}</span>
                                            <div className="flex gap-0.5">
                                                {[1,2,3,4,5].map(s => <Star key={s} size={10} className={s <= c.stars ? "fill-yellow-400 text-yellow-400" : "text-slate-100"} />)}
                                            </div>
                                        </div>
                                        <p className="text-slate-500 text-xs leading-relaxed italic">"{c.text}"</p>
                                        <p className="text-[8px] font-black text-slate-300 uppercase mt-2">{c.date}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* MODAL "ME AVISE" */}
      <AnimatePresence>
        {showMeAviseModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" onClick={() => setShowMeAviseModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative bg-white w-full max-w-md rounded-[4rem] p-10 shadow-2xl overflow-hidden text-center">
                <button onClick={() => setShowMeAviseModal(false)} className="absolute top-8 right-8 text-slate-300"><X /></button>
                <div className="w-20 h-20 bg-rose-50 rounded-[2.5rem] flex items-center justify-center text-rose-500 mx-auto mb-6"><Bell size={32} /></div>
                <h3 className="text-3xl font-black italic uppercase tracking-tighter mb-4 leading-none">Me Avise!</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-8">O item <span className="text-rose-500">{meAviseProduct?.name}</span> está esgotado. Deixe seu contato:</p>
                <form onSubmit={submitMeAvise} className="space-y-4">
                    <input required placeholder="Seu Nome" className="input-style" value={meAviseForm.nome} onChange={e => setMeAviseForm({...meAviseForm, nome: e.target.value})} />
                    <input required placeholder="Seu WhatsApp" className="input-style" value={meAviseForm.whatsapp} onChange={e => setMeAviseForm({...meAviseForm, whatsapp: e.target.value})} />
                    <button type="submit" className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl hover:bg-rose-500 transition-all mt-4">Enviar Solicitação</button>
                </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LOGIN ADMIN */}
      <AnimatePresence>
        {showAdminLogin && (
          <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[4rem] p-12 w-full max-w-sm">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter text-center mb-8">Acesso Restrito</h3>
              <input type="password" placeholder="SENHA" className="input-style text-center mb-4 tracking-widest" value={adminPassInput} onChange={e => setAdminPassInput(e.target.value)} />
              <button onClick={() => adminPassInput === ADMIN_PASSWORD ? (setView('admin'), setShowAdminLogin(false)) : alert("Senha incorreta")} className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black uppercase tracking-widest">Entrar</button>
              <button onClick={() => setShowAdminLogin(false)} className="w-full text-[10px] font-bold text-slate-400 mt-6 uppercase">Voltar</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .input-style {
            width: 100%; padding: 1.2rem; background: #f8fafc; border: 2px solid #f1f5f9;
            border-radius: 1.5rem; font-weight: 800; font-size: 0.8rem; outline: none; transition: 0.3s;
        }
        .input-style:focus { border-color: #dbeafe; background: white; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default App;