import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useEmblaCarousel from 'embla-carousel-react';
import {
  DollarSign,
  Shield,
  Zap,
  BarChart3,
  Users,
  FileText,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Clock,
  Calculator,
  Building2,
  Smartphone,
  Globe,
  Star,
  ChevronRight,
  Target,
  PieChart,
  MapPin,
  Handshake,
  ChevronLeft
} from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();
  const [loanAmount, setLoanAmount] = useState(10000);
  const [interestRate, setInterestRate] = useState(3);
  const [months, setMonths] = useState(12);
  
  // Carrusel de imágenes profesionales
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Autoplay manual
  useEffect(() => {
    if (!emblaApi) return;
    
    const autoplayInterval = setInterval(() => {
      emblaApi.scrollNext();
    }, 5000);
    
    return () => clearInterval(autoplayInterval);
  }, [emblaApi]);
  
  const carouselImages = [
    {
      url: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1920&q=80',
      alt: 'Financiamiento empresarial profesional',
      title: 'Gestión Financiera Profesional'
    },
    {
      url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1920&q=80',
      alt: 'Análisis financiero y gráficos de préstamos',
      title: 'Análisis Inteligente de Préstamos'
    },
    {
      url: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1920&q=80',
      alt: 'Documentos financieros y calculadora',
      title: 'Análisis y Cálculo Preciso'
    }
  ];

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
    };

    emblaApi.on('select', onSelect);
    onSelect();

    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = () => emblaApi?.scrollPrev();
  const scrollNext = () => emblaApi?.scrollNext();

  const monthlyPayment = loanAmount > 0 && interestRate > 0 && months > 0
    ? (loanAmount * (interestRate / 100) * Math.pow(1 + interestRate / 100, months)) /
      (Math.pow(1 + interestRate / 100, months) - 1)
    : 0;

  const totalPayment = monthlyPayment * months;
  const totalInterest = totalPayment - loanAmount;

  const benefits = [
    {
      icon: Zap,
      title: 'Aprobación Rápida',
      description: 'Procesa préstamos en minutos, no en días'
    },
    {
      icon: Shield,
      title: 'Seguro y Confiable',
      description: 'Tus datos están protegidos con tecnología de última generación'
    },
    {
      icon: BarChart3,
      title: 'Control Total',
      description: 'Gestiona todos tus préstamos desde un solo lugar'
    },
    {
      icon: Users,
      title: 'Gestión de Clientes',
      description: 'Mantén un registro completo de todos tus clientes'
    },
    {
      icon: FileText,
      title: 'Reportes Detallados',
      description: 'Genera reportes completos y análisis en tiempo real'
    },
    {
      icon: Clock,
      title: 'Disponible 24/7',
      description: 'Accede a tu sistema desde cualquier lugar y en cualquier momento'
    }
  ];

  const features = [
    {
      icon: DollarSign,
      title: 'Gestión de Préstamos',
      description: 'Crea, modifica y gestiona préstamos con facilidad. Calcula intereses, moras y pagos automáticamente.',
      color: 'text-blue-600'
    },
    {
      icon: Users,
      title: 'Base de Datos de Clientes',
      description: 'Mantén un registro completo de tus clientes con historial de préstamos y pagos.',
      color: 'text-green-600'
    },
    {
      icon: PieChart,
      title: 'Reportes y Estadísticas',
      description: 'Visualiza el rendimiento de tu negocio con gráficos y reportes detallados.',
      color: 'text-purple-600'
    },
    {
      icon: MapPin,
      title: 'Gestión de Rutas',
      description: 'Organiza y gestiona las rutas de cobro de tus empleados de manera eficiente.',
      color: 'text-orange-600'
    },
    {
      icon: Handshake,
      title: 'Acuerdos de Pago',
      description: 'Gestiona acuerdos de pago con tus clientes y realiza seguimiento de cumplimiento.',
      color: 'text-red-600'
    },
    {
      icon: Building2,
      title: 'Multi-empresa',
      description: 'Gestiona múltiples empresas y sucursales desde una sola plataforma.',
      color: 'text-indigo-600'
    }
  ];

  const testimonials = [
    {
      name: 'María González',
      role: 'Dueña de Préstamos Express',
      content: 'ProPréstamos ha transformado completamente mi negocio. Ahora puedo gestionar todos mis préstamos de manera eficiente y profesional.',
      rating: 5
    },
    {
      name: 'Carlos Rodríguez',
      role: 'Gerente de Finanzas',
      content: 'La facilidad de uso y los reportes detallados me permiten tomar mejores decisiones para mi empresa.',
      rating: 5
    },
    {
      name: 'Ana Martínez',
      role: 'Emprendedora',
      content: 'Desde que uso ProPréstamos, he ahorrado horas de trabajo manual. El sistema es intuitivo y muy completo.',
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary-500">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">ProPréstamos</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => navigate('/login')}
              className="hidden sm:flex"
            >
              Iniciar Sesión
            </Button>
            <Button
              onClick={() => navigate('/register')}
              className="bg-primary-500 hover:bg-primary-600"
            >
              Regístrate Gratis
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section with Carousel Background */}
      <section className="relative overflow-hidden py-20 sm:py-32 min-h-[600px] flex items-center">
        {/* Carrusel de fondo */}
        <div className="absolute inset-0 z-0">
          <div className="embla overflow-hidden h-full" ref={emblaRef}>
            <div className="embla__container flex h-full">
              {carouselImages.map((image, index) => (
                <div key={index} className="embla__slide flex-[0_0_100%] min-w-0 relative">
                  <div 
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: `url(${image.url})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-900/80 via-primary-800/70 to-primary-900/80"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Controles del carrusel */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={scrollPrev}
              className="bg-white/20 backdrop-blur-sm border-white/30 text-white hover:bg-white/30 rounded-full"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex gap-2">
              {carouselImages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => emblaApi?.scrollTo(index)}
                  className={`h-2 rounded-full transition-all ${
                    index === selectedIndex 
                      ? 'w-8 bg-white' 
                      : 'w-2 bg-white/50 hover:bg-white/75'
                  }`}
                  aria-label={`Ir a imagen ${index + 1}`}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={scrollNext}
              className="bg-white/20 backdrop-blur-sm border-white/30 text-white hover:bg-white/30 rounded-full"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Contenido sobre el carrusel */}
        <div className="container px-4 relative z-10">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-4 py-2 text-sm font-medium text-white border border-white/30">
              <Zap className="h-4 w-4" />
              <span>Gestión de Préstamos Simplificada</span>
            </div>
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-white sm:text-6xl drop-shadow-lg">
              Gestiona tus Préstamos con
              <span className="text-primary-200"> Facilidad y Eficiencia</span>
            </h1>
            <p className="mb-8 text-lg text-white/95 sm:text-xl drop-shadow-md">
              La plataforma completa para administrar préstamos, clientes y cobros.
              Diseñada para empresas que buscan profesionalizar su gestión financiera.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                className="w-full sm:w-auto bg-white text-primary-600 hover:bg-gray-100 text-lg px-8 py-6 font-semibold shadow-xl"
              >
                Comenzar Ahora
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/login')}
                className="w-full sm:w-auto bg-white/20 backdrop-blur-sm border-2 border-white text-white hover:bg-white hover:text-primary-600 text-lg px-8 py-6 font-semibold"
              >
                Iniciar Sesión
              </Button>
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]">
          <div className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-primary-200 to-primary-400 opacity-20 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"></div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-white">
        <div className="container px-4">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              ¿Por qué elegir ProPréstamos?
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Todo lo que necesitas para gestionar tu negocio de préstamos en un solo lugar
            </p>
          </div>
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit, index) => (
              <Card key={index} className="border-2 hover:border-primary-300 transition-all hover:shadow-lg">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
                    <benefit.icon className="h-6 w-6 text-primary-600" />
                  </div>
                  <CardTitle className="text-xl">{benefit.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">{benefit.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="container px-4">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Características Principales
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Descubre todas las herramientas que tenemos para ti
            </p>
          </div>
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card key={index} className="group hover:shadow-xl transition-all">
                <CardHeader>
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 group-hover:bg-primary-100 transition-colors`}>
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Calculator Section */}
      <section className="py-20 bg-white">
        <div className="container px-4">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-4">
                Calculadora de Préstamos
              </h2>
              <p className="text-lg text-gray-600">
                Simula tus préstamos y calcula pagos mensuales al instante
              </p>
            </div>
            <Card className="border-2 border-primary-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calculator className="h-6 w-6 text-primary-600" />
                  <CardTitle>Calcula tu Préstamo</CardTitle>
                </div>
                <CardDescription>
                  Ingresa los datos de tu préstamo para ver el cálculo automático
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Monto del Préstamo</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="amount"
                        type="number"
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(Number(e.target.value))}
                        className="pl-10"
                        min="0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rate">Tasa de Interés Mensual (%)</Label>
                    <Input
                      id="rate"
                      type="number"
                      value={interestRate}
                      onChange={(e) => setInterestRate(Number(e.target.value))}
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="months">Plazo (Meses)</Label>
                    <Input
                      id="months"
                      type="number"
                      value={months}
                      onChange={(e) => setMonths(Number(e.target.value))}
                      min="1"
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-primary-50 p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Pago Mensual:</span>
                    <span className="text-2xl font-bold text-primary-600">
                      ${monthlyPayment.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total a Pagar:</span>
                    <span className="text-xl font-semibold text-gray-900">
                      ${totalPayment.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total de Intereses:</span>
                    <span className="text-xl font-semibold text-gray-700">
                      ${totalInterest.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Desktop Screens Section */}
      <section className="py-20 bg-white">
        <div className="container px-4">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Interfaz Moderna e Intuitiva
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Diseñada para ser fácil de usar y potente en funcionalidades
            </p>
          </div>
          <div className="mx-auto max-w-6xl">
            {/* Desktop Screen Mockup 1 */}
            <div className="mb-16">
              <div className="relative mx-auto max-w-5xl">
                {/* Browser Frame */}
                <div className="rounded-lg border-4 border-gray-800 bg-gray-800 shadow-2xl">
                  {/* Browser Header */}
                  <div className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded-t">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-red-500"></div>
                      <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                      <div className="h-3 w-3 rounded-full bg-green-500"></div>
                    </div>
                    <div className="flex-1 mx-4 bg-gray-600 rounded px-4 py-1 text-xs text-gray-300">
                      proprestamos.com/dashboard
                    </div>
                  </div>
                  {/* Screen Content */}
                  <div className="bg-white p-8 rounded-b">
                    <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-lg p-8 border-2 border-primary-200">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div className="bg-white rounded-lg p-6 shadow-md border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Préstamos Activos</span>
                            <DollarSign className="h-5 w-5 text-primary-600" />
                          </div>
                          <div className="text-3xl font-bold text-gray-900">1,234</div>
                          <div className="text-sm text-green-600 mt-2">↑ 12% este mes</div>
                        </div>
                        <div className="bg-white rounded-lg p-6 shadow-md border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Clientes</span>
                            <Users className="h-5 w-5 text-green-600" />
                          </div>
                          <div className="text-3xl font-bold text-gray-900">856</div>
                          <div className="text-sm text-green-600 mt-2">↑ 8% este mes</div>
                        </div>
                        <div className="bg-white rounded-lg p-6 shadow-md border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Ingresos</span>
                            <TrendingUp className="h-5 w-5 text-purple-600" />
                          </div>
                          <div className="text-3xl font-bold text-gray-900">$45.2K</div>
                          <div className="text-sm text-green-600 mt-2">↑ 15% este mes</div>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-6 shadow-md border border-gray-200">
                        <div className="flex items-center gap-2 mb-4">
                          <BarChart3 className="h-5 w-5 text-primary-600" />
                          <h3 className="font-semibold text-gray-900">Análisis de Préstamos</h3>
                        </div>
                        <div className="h-48 bg-gradient-to-br from-primary-100 to-primary-200 rounded flex items-center justify-center">
                          <BarChart3 className="h-16 w-16 text-primary-400" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-center mt-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Dashboard Interactivo</h3>
                <p className="text-gray-600">
                  Visualiza todas tus métricas importantes en tiempo real
                </p>
              </div>
            </div>

            {/* Desktop Screen Mockup 2 */}
            <div className="mb-16">
              <div className="relative mx-auto max-w-5xl">
                <div className="rounded-lg border-4 border-gray-800 bg-gray-800 shadow-2xl">
                  <div className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded-t">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-red-500"></div>
                      <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                      <div className="h-3 w-3 rounded-full bg-green-500"></div>
                    </div>
                    <div className="flex-1 mx-4 bg-gray-600 rounded px-4 py-1 text-xs text-gray-300">
                      proprestamos.com/clientes
                    </div>
                  </div>
                  <div className="bg-white p-8 rounded-b">
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-8 border-2 border-green-200">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">Gestión de Clientes</h2>
                        <Button className="bg-primary-500 hover:bg-primary-600">
                          <Users className="h-4 w-4 mr-2" />
                          Nuevo Cliente
                        </Button>
                      </div>
                      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                        <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 border-b font-semibold text-sm text-gray-700">
                          <div>Nombre</div>
                          <div>Teléfono</div>
                          <div>Préstamos</div>
                          <div>Estado</div>
                        </div>
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="grid grid-cols-4 gap-4 p-4 border-b hover:bg-gray-50">
                            <div className="font-medium text-gray-900">Cliente {i}</div>
                            <div className="text-gray-600">+1 234 567 890{i}</div>
                            <div className="text-gray-600">{i * 2} activos</div>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-green-500"></div>
                              <span className="text-sm text-gray-600">Activo</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-center mt-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Gestión de Clientes</h3>
                <p className="text-gray-600">
                  Administra toda la información de tus clientes de forma organizada
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile Screens Section */}
      <section className="py-20 bg-gray-50">
        <div className="container px-4">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Acceso desde Cualquier Dispositivo
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Tu sistema disponible en móviles y tablets
            </p>
          </div>
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 md:grid-cols-3">
              {/* Mobile Mockup 1 */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  {/* Phone Frame */}
                  <div className="w-64 h-[500px] bg-gray-900 rounded-[3rem] p-2 shadow-2xl">
                    <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden">
                      {/* Status Bar */}
                      <div className="bg-primary-600 text-white text-xs px-4 py-1 flex justify-between items-center">
                        <span>9:41</span>
                        <div className="flex gap-1">
                          <div className="w-4 h-2 border border-white rounded-sm"></div>
                          <div className="w-1 h-1 bg-white rounded-full"></div>
                        </div>
                      </div>
                      {/* App Content */}
                      <div className="p-4 h-full bg-gradient-to-br from-primary-50 to-white">
                        <div className="mb-4">
                          <h3 className="text-lg font-bold text-gray-900 mb-2">Dashboard</h3>
                        </div>
                        <div className="space-y-3">
                          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">Préstamos</span>
                              <DollarSign className="h-4 w-4 text-primary-600" />
                            </div>
                            <div className="text-2xl font-bold text-gray-900">1,234</div>
                          </div>
                          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">Clientes</span>
                              <Users className="h-4 w-4 text-green-600" />
                            </div>
                            <div className="text-2xl font-bold text-gray-900">856</div>
                          </div>
                          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">Ingresos</span>
                              <TrendingUp className="h-4 w-4 text-purple-600" />
                            </div>
                            <div className="text-2xl font-bold text-gray-900">$45.2K</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-center mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Dashboard Móvil</h3>
                  <p className="text-sm text-gray-600">
                    Accede a tus métricas desde cualquier lugar
                  </p>
                </div>
              </div>

              {/* Mobile Mockup 2 */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="w-64 h-[500px] bg-gray-900 rounded-[3rem] p-2 shadow-2xl">
                    <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden">
                      <div className="bg-primary-600 text-white text-xs px-4 py-1 flex justify-between items-center">
                        <span>9:41</span>
                        <div className="flex gap-1">
                          <div className="w-4 h-2 border border-white rounded-sm"></div>
                          <div className="w-1 h-1 bg-white rounded-full"></div>
                        </div>
                      </div>
                      <div className="p-4 h-full bg-gradient-to-br from-green-50 to-white">
                        <div className="mb-4">
                          <h3 className="text-lg font-bold text-gray-900 mb-2">Clientes</h3>
                          <div className="relative">
                            <Input placeholder="Buscar cliente..." className="h-9 text-sm" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                                  <Users className="h-5 w-5 text-primary-600" />
                                </div>
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">Cliente {i}</div>
                                  <div className="text-xs text-gray-600">+1 234 567 890{i}</div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-center mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Gestión Móvil</h3>
                  <p className="text-sm text-gray-600">
                    Gestiona clientes desde tu móvil
                  </p>
                </div>
              </div>

              {/* Mobile Mockup 3 */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="w-64 h-[500px] bg-gray-900 rounded-[3rem] p-2 shadow-2xl">
                    <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden">
                      <div className="bg-primary-600 text-white text-xs px-4 py-1 flex justify-between items-center">
                        <span>9:41</span>
                        <div className="flex gap-1">
                          <div className="w-4 h-2 border border-white rounded-sm"></div>
                          <div className="w-1 h-1 bg-white rounded-full"></div>
                        </div>
                      </div>
                      <div className="p-4 h-full bg-gradient-to-br from-purple-50 to-white">
                        <div className="mb-4">
                          <h3 className="text-lg font-bold text-gray-900 mb-2">Reportes</h3>
                        </div>
                        <div className="space-y-3">
                          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                            <div className="flex items-center gap-3 mb-3">
                              <FileText className="h-5 w-5 text-purple-600" />
                              <div>
                                <div className="font-semibold text-gray-900">Reporte Mensual</div>
                                <div className="text-xs text-gray-600">Enero 2024</div>
                              </div>
                            </div>
                            <div className="h-24 bg-gradient-to-br from-purple-100 to-purple-200 rounded flex items-center justify-center">
                              <PieChart className="h-8 w-8 text-purple-400" />
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">Total Ingresos</span>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">$45,234</div>
                            <div className="text-xs text-green-600 mt-1">↑ 12% vs mes anterior</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-center mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Reportes Móviles</h3>
                  <p className="text-sm text-gray-600">
                    Visualiza reportes en tiempo real
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-white">
        <div className="container px-4">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Lo que dicen nuestros clientes
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Empresas que confían en ProPréstamos
            </p>
          </div>
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="border-2 hover:shadow-lg transition-all">
                <CardHeader>
                  <div className="flex items-center gap-1 mb-2">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <CardDescription className="text-base">{testimonial.content}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                      <Users className="h-5 w-5 text-primary-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{testimonial.name}</p>
                      <p className="text-sm text-gray-600">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-primary-600 to-primary-700">
        <div className="container px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4">
              ¿Listo para transformar tu negocio?
            </h2>
            <p className="mb-8 text-lg text-primary-100">
              Únete a cientos de empresas que ya están usando ProPréstamos
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                className="w-full sm:w-auto bg-white text-primary-600 hover:bg-gray-100 text-lg px-8 py-6"
              >
                Comenzar Gratis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                onClick={() => navigate('/login')}
                className="w-full sm:w-auto bg-white/20 backdrop-blur-sm border-2 border-white text-white hover:bg-white hover:text-primary-600 text-lg px-8 py-6 font-semibold transition-all"
              >
                Iniciar Sesión
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12">
        <div className="container px-4">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-primary-500">
                    <DollarSign className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-lg font-bold text-white">ProPréstamos</span>
                </div>
                <p className="text-sm">
                  La plataforma completa para gestionar tu negocio de préstamos.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-4">Producto</h3>
                <ul className="space-y-2 text-sm">
                  <li><a href="#" className="hover:text-white transition-colors">Características</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Precios</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Seguridad</a></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-4">Empresa</h3>
                <ul className="space-y-2 text-sm">
                  <li><a href="#" className="hover:text-white transition-colors">Sobre Nosotros</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Contacto</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Soporte</a></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-4">Legal</h3>
                <ul className="space-y-2 text-sm">
                  <li><a href="#" className="hover:text-white transition-colors">Términos</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Privacidad</a></li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border-t border-gray-800 pt-8 text-center text-sm">
              <p>&copy; {new Date().getFullYear()} ProPréstamos. Todos los derechos reservados.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

