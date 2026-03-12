document.addEventListener('DOMContentLoaded', () => {
    // Referensi Elemen DOM
    const sliderWrapper = document.getElementById('slider-wrapper');
    const dots = document.querySelectorAll('.dot');
    const closeAdBtn = document.getElementById('close-ad');
    const adPopup = document.getElementById('ad-popup');
    
    let currentIndex = 0;
    const totalSlides = dots.length;
    
    // Fitur Gestur Swipe (Touch)
    let startX = 0;
    let endX = 0;
    let isSwiping = false;

    // ==========================================
    //  AUTO-SLIDE (setiap 4 detik)
    // ==========================================
    const AUTO_SLIDE_INTERVAL = 4000; // milidetik
    let autoSlideTimer = null;

    function startAutoSlide() {
        stopAutoSlide(); // pastikan tidak dobel
        autoSlideTimer = setInterval(() => {
            goToSlide(currentIndex + 1);
        }, AUTO_SLIDE_INTERVAL);
    }

    function stopAutoSlide() {
        if (autoSlideTimer) {
            clearInterval(autoSlideTimer);
            autoSlideTimer = null;
        }
    }

    // Reset timer setiap kali user interaksi manual
    function resetAutoSlide() {
        stopAutoSlide();
        startAutoSlide();
    }

    // Untuk memastikan body tidak bisa discroll saat popup terbuka
    document.body.classList.add('no-scroll');

    // Fungsi utama untuk berpindah slide
    function goToSlide(index) {
        if (index < 0) {
            index = totalSlides - 1; // Looping ke akhir
        } else if (index >= totalSlides) {
            index = 0; // Looping ke awal
        }
        
        // Pindahkan Wrapper Slider dengan CSS transform
        sliderWrapper.style.transform = `translateX(-${index * 100}%)`;
        
        // Perbarui state Pagination Dots
        dots.forEach(dot => dot.classList.remove('active'));
        dots[index].classList.add('active');
        
        currentIndex = index;
    }

    // Event Listener untuk setiap Dot
    dots.forEach((dot) => {
        dot.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'), 10);
            goToSlide(index);
            resetAutoSlide(); // reset timer saat user klik dot
        });
    });

    // Menutup Modal Iklan
    function closeBanner() {
        adPopup.classList.add('hidden');
        adPopup.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('no-scroll');
        stopAutoSlide(); // hentikan auto-slide saat ditutup
    }

    closeAdBtn.addEventListener('click', closeBanner);

    // Opsi: Tutup banner ketika klik di luar kotak iklan (di overlay blur)
    adPopup.addEventListener('click', (e) => {
        if (e.target === adPopup) {
            closeBanner();
        }
    });

    // Event Listener untuk Touch (Gestur Geser / Swipe) di Handphone
    if (window.PointerEvent) {
        // Modern browsers
        sliderWrapper.addEventListener('pointerdown', (e) => {
            startX = e.clientX;
            isSwiping = true;
            sliderWrapper.setPointerCapture(e.pointerId);
            stopAutoSlide(); // pause saat user mulai swipe
        });
        
        sliderWrapper.addEventListener('pointermove', (e) => {
            if (!isSwiping) return;
            endX = e.clientX;
        });

        sliderWrapper.addEventListener('pointerup', (e) => {
            if (!isSwiping) return;
            sliderWrapper.releasePointerCapture(e.pointerId);
            handleSwipeEnd();
        });
    } else {
        // Fallback older touch devices
        sliderWrapper.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isSwiping = true;
            stopAutoSlide(); // pause saat user mulai swipe
        }, { passive: true });

        sliderWrapper.addEventListener('touchmove', (e) => {
            if (!isSwiping) return;
            endX = e.touches[0].clientX;
        }, { passive: true });

        sliderWrapper.addEventListener('touchend', () => {
            if (!isSwiping) return;
            handleSwipeEnd();
        });
    }

    function handleSwipeEnd() {
        // Tentukan arah swipe (threshold minimal 30px)
        const diffX = startX - endX;
        
        if (Math.abs(diffX) > 30 && endX !== 0) {
            if (diffX > 0) {
                goToSlide(currentIndex + 1);
            } else {
                goToSlide(currentIndex - 1);
            }
        }
        
        endX = 0;
        isSwiping = false;
        resetAutoSlide(); // lanjut auto-slide setelah swipe selesai
    }

    // Cegah image dragging bawaan browser agar swipe lancar
    const images = sliderWrapper.querySelectorAll('img');
    images.forEach(img => {
        img.addEventListener('dragstart', (e) => e.preventDefault());
    });

    // Mulai auto-slide saat halaman dimuat
    startAutoSlide();
});
